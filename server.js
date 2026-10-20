require('dotenv').config();
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const bodyParser = require('body-parser');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;

const { generateEmailHtml } = require('./email_template');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public')); // for css if needed

const db = new sqlite3.Database('./database.sqlite');

// Configure Email Transporter (Microsoft 365 or fallback)
let transporter;

if (process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_USER !== 'seu-email@seudominio.com.br') {
    console.log(`[SMTP] Usando credenciais Microsoft 365 salvas no .env para: ${process.env.SMTP_USER}`);
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.office365.com',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        },
        tls: {
            ciphers: 'SSLv3',
            rejectUnauthorized: false
        }
    });

    transporter.verify((err, success) => {
        if (err) {
            console.warn(`[SMTP AVISO] Falha ao autenticar no servidor: ${err.message}`);
        } else {
            console.log(`[SMTP SUCESSO] Conexão com Microsoft 365 estabelecida com sucesso!`);
        }
    });
} else {
    console.log('[SMTP] Nenhuma credencial configurada no .env. Executando em modo de simulação local.');
    transporter = nodemailer.createTransport({ streamTransport: true });
}

// Presentation screen: Request OS and CIE
app.get('/', (req, res) => {
    res.render('index');
});

// Handle sending survey
app.post('/send-survey', (req, res) => {
    const { os_number, cie } = req.body;
    
    // Find school
    db.get("SELECT * FROM schools WHERE cie = ?", [cie], (err, school) => {
        if (err || !school) {
            return res.send("Escola não encontrada com esse CIE.");
        }
        
        const token = uuidv4();
        
        // Save pending survey
        db.run("INSERT INTO surveys (token, os_number, cie) VALUES (?, ?, ?)", [token, os_number, cie], function(err) {
            if (err) {
                return res.send("Erro ao criar pesquisa.");
            }
            
            const surveyLink = `http://localhost:${PORT}/survey/${token}`;
            const previewUrl = `http://localhost:${PORT}/email-preview/${token}`;
            
            // Render the screen immediately so the user doesn't wait for the email timeout
            res.render('email_sent', { 
                school, 
                os_number, 
                previewUrl, 
                surveyLink, 
                emailError: null,
                isPowerAutomate: !!process.env.POWER_AUTOMATE_WEBHOOK_URL
            });

            // Remetente configurado
            const senderName = process.env.SMTP_FROM_NAME || 'Pesquisa de Qualidade - TI';
            const senderEmail = (process.env.SMTP_USER && process.env.SMTP_USER !== 'seu-email@seudominio.com.br') 
                ? process.env.SMTP_USER 
                : 'no-reply@qualidade.com';

            const emailHtml = generateEmailHtml({
                schoolName: school.name,
                cie: school.cie,
                osNumber: os_number,
                surveyLink,
                email: school.email
            });

            // Se tiver URL do Power Automate configurada, envia via Power Automate
            if (process.env.POWER_AUTOMATE_WEBHOOK_URL) {
                console.log(`[Power Automate] Disparando fluxo para ${school.email}...`);
                fetch(process.env.POWER_AUTOMATE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to: school.email,
                        school_name: school.name,
                        cie: school.cie,
                        os_number: os_number,
                        survey_link: surveyLink,
                        subject: `Pesquisa de Satisfação - Atendimento OS: ${os_number}`,
                        body_html: emailHtml
                    })
                })
                .then(response => {
                    if (response.ok) {
                        console.log(`[Power Automate SUCESSO] E-mail disparado para ${school.email} via Power Automate!`);
                    } else {
                        console.warn(`[Power Automate AVISO] Status ${response.status}: ${response.statusText}`);
                    }
                })
                .catch(err => {
                    console.error(`[Power Automate ERRO] Falha ao chamar o fluxo: ${err.message}`);
                });
            } else {
                // Modo SMTP Tradicional
                let message = {
                    from: `"${senderName}" <${senderEmail}>`,
                    to: school.email,
                    subject: `Pesquisa de Satisfação - Atendimento OS: ${os_number}`,
                    text: `Olá ${school.name},\n\nGostaríamos de saber sua opinião sobre o atendimento de tecnologia realizado recentemente (OS: ${os_number}).\n\nPor favor, responda à pesquisa no link abaixo:\n${surveyLink}\n\nObrigado!`,
                    html: emailHtml
                };
                transporter.sendMail(message, (err, info) => {
                    if (err) {
                        console.log('Error sending email to ' + school.email + ': ' + err.message);
                    } else {
                        console.log('Message sent: %s', info.messageId);
                    }
                });
            }
        });
    });
});

// Email Preview Route
app.get('/email-preview/:token', (req, res) => {
    const token = req.params.token;
    db.get("SELECT surveys.*, schools.name, schools.email FROM surveys JOIN schools ON surveys.cie = schools.cie WHERE token = ?", [token], (err, survey) => {
        if (err || !survey) {
            return res.send("Preview não encontrado.");
        }
        const surveyLink = `http://localhost:${PORT}/survey/${token}`;
        const htmlEmail = generateEmailHtml({
            schoolName: survey.name,
            cie: survey.cie,
            osNumber: survey.os_number,
            surveyLink,
            email: survey.email
        });
        res.send(htmlEmail);
    });
});

// Survey Page
app.get('/survey/:token', (req, res) => {
    const token = req.params.token;
    db.get("SELECT surveys.*, schools.name FROM surveys JOIN schools ON surveys.cie = schools.cie WHERE token = ?", [token], (err, survey) => {
        if (err || !survey) {
            return res.send("Pesquisa inválida ou não encontrada.");
        }
        if (survey.status === 'completed') {
            return res.send("Esta pesquisa já foi respondida. Muito obrigado!");
        }
        res.render('survey', { survey });
    });
});

// Handle Survey Submission
app.post('/survey/:token', (req, res) => {
    const token = req.params.token;
    const { q1_score, q2_score, q3_score } = req.body;
    
    const query = `UPDATE surveys SET 
        q1_score = ?, q2_score = ?, q3_score = ?, 
        status = 'completed', completed_at = CURRENT_TIMESTAMP 
        WHERE token = ? AND status = 'pending'`;
        
    db.run(query, [q1_score, q2_score, q3_score, token], function(err) {
        if (err) {
            return res.send("Erro ao salvar pesquisa.");
        }
        res.render('thanks');
    });
});

// Dashboard
app.get('/dashboard', (req, res) => {
    const query = `
        SELECT surveys.*, schools.name as school_name 
        FROM surveys 
        JOIN schools ON surveys.cie = schools.cie
        ORDER BY surveys.created_at DESC
    `;
    
    db.all(query, [], (err, surveys) => {
        if (err) {
            return res.send("Erro ao carregar dashboard.");
        }
        
        let completed = surveys.filter(s => s.status === 'completed');
        
        let avgQ1 = completed.reduce((acc, curr) => acc + curr.q1_score, 0) / (completed.length || 1);
        let avgQ2 = completed.reduce((acc, curr) => acc + curr.q2_score, 0) / (completed.length || 1);
        let avgQ3 = completed.reduce((acc, curr) => acc + curr.q3_score, 0) / (completed.length || 1);
        
        res.render('dashboard', { surveys, completed, avgQ1, avgQ2, avgQ3 });
    });
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
