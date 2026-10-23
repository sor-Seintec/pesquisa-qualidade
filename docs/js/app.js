// =====================================================================
// Núcleo compartilhado: Firebase, regra de e-mail, grupos, template e envio
// =====================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { SCHOOLS } from "./schools.js";

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export { SCHOOLS };

// ---------------------------------------------------------------------
// DEFINIÇÃO DOS SISTEMAS DO HUB DE CONEXÃO
// ---------------------------------------------------------------------
export const SYSTEMS = {
  agendamento: {
    id: "agendamento",
    label: "Gestão de Agendamento",
    subtitle: "Suporte de Tecnologia às Unidades Escolares",
    defaultOs: "OS-TI",
    requireSchool: true,
    requireOs: true
  },
  pec: {
    id: "pec",
    label: "Sistema do PEC",
    subtitle: "Acompanhamento Pedagógico e Tecnologia (PEC)",
    defaultOs: "PEC",
    requireSchool: false,
    requireOs: false
  },
  supervisor: {
    id: "supervisor",
    label: "Sistema Supervisor",
    subtitle: "Supervisão de Ensino — U.R.E. Sorocaba",
    defaultOs: "SUPERVISOR",
    requireSchool: false,
    requireOs: false
  },
  avulso: {
    id: "avulso",
    label: "Envio Avulso",
    subtitle: "Pesquisa de Satisfação — U.R.E. Sorocaba",
    defaultOs: "AVULSO",
    requireSchool: false,
    requireOs: false
  }
};

// ---------------------------------------------------------------------
// REGRA DE E-MAIL DAS ESCOLAS
// e + CIE com 6 dígitos (CIE de 5 dígitos ganha um 0 na frente) + sufixo + @educacao.sp.gov.br
// Ex.: CIE 16093 -> e016093a@educacao.sp.gov.br
// ---------------------------------------------------------------------
export const EMAIL_SUFFIX = "a";
export const EMAIL_DOMAIN = "@educacao.sp.gov.br";
const TEST_SCHOOLS = { "2110": "angeloruivo@gmail.com" }; // escola de teste

export function schoolEmail(cie) {
  const c = String(cie).trim();
  if (TEST_SCHOOLS[c]) return TEST_SCHOOLS[c];
  return "e" + c.padStart(6, "0") + EMAIL_SUFFIX + EMAIL_DOMAIN;
}

export function findSchool(cieOrText) {
  const raw = String(cieOrText || "").trim();
  if (!raw) return null;
  const direct = SCHOOLS.find(x => x.cie === raw);
  if (direct) return { ...direct, email: schoolEmail(direct.cie) };
  const byPrefix = raw.match(/^(\d{4,6})\b/);
  if (byPrefix) {
    const s = SCHOOLS.find(x => x.cie === byPrefix[1]);
    if (s) return { ...s, email: schoolEmail(s.cie) };
  }
  const lower = raw.toLowerCase();
  const byName = SCHOOLS.find(x => x.name.toLowerCase() === lower);
  return byName ? { ...byName, email: schoolEmail(byName.cie) } : null;
}

export function findSchoolByEmail(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean) return null;
  for (const s of SCHOOLS) {
    if (schoolEmail(s.cie).toLowerCase() === clean) {
      return { ...s, email: schoolEmail(s.cie) };
    }
  }
  return null;
}

export const isTestSchool = cie => !!TEST_SCHOOLS[String(cie)];

// URLs públicas (funcionam no GitHub Pages e localmente)
export const pageUrl = file => new URL(file, window.location.href).href;
export const surveyUrl = token => pageUrl("pesquisa.html?t=" + encodeURIComponent(token));
export const logoUrl = () => pageUrl("images/logo_ure.png");

export function escapeHtml(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function parseEmailList(raw) {
  const parts = String(raw || "")
    .split(/[,;\n\r\s]+/)
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);
  const unique = [...new Set(parts)];
  const valid = [];
  const invalid = [];
  for (const e of unique) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) valid.push(e);
    else invalid.push(e);
  }
  return { valid, invalid };
}

// ---------------------------------------------------------------------
// BANCO DE CADASTRO DE E-MAILS E GRUPOS (Firestore: config/email_groups)
// ---------------------------------------------------------------------
const EMPTY_GROUPS = () => ({ agendamento: [], pec: [], supervisor: [], avulso: [] });
let cachedGroups = null;

export async function getEmailGroups(forceRefresh = false) {
  if (cachedGroups && !forceRefresh) return cachedGroups;
  try {
    const snap = await getDoc(doc(db, "config", "email_groups"));
    const data = snap.exists() ? (snap.data().groups || {}) : {};
    cachedGroups = {
      agendamento: Array.isArray(data.agendamento) ? data.agendamento : [],
      pec: Array.isArray(data.pec) ? data.pec : [],
      supervisor: Array.isArray(data.supervisor) ? data.supervisor : [],
      avulso: Array.isArray(data.avulso) ? data.avulso : []
    };
  } catch (e) {
    console.warn("Erro ao carregar grupos de e-mail:", e);
    cachedGroups = EMPTY_GROUPS();
  }
  return cachedGroups;
}

export async function saveEmailsToGroup(groupKey, newEntries) {
  const groups = await getEmailGroups(true);
  const list = Array.isArray(groups[groupKey]) ? [...groups[groupKey]] : [];
  let added = 0;

  for (const item of newEntries) {
    const email = String(item.email || "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    const school = item.cie ? findSchool(item.cie) : findSchoolByEmail(email);
    const cie = item.cie || school?.cie || "";
    const schoolName = item.schoolName || school?.name || "";
    const existingIdx = list.findIndex(x => String(x.email || "").toLowerCase() === email);
    if (existingIdx >= 0) {
      if (cie && !list[existingIdx].cie) list[existingIdx].cie = cie;
      if (schoolName && !list[existingIdx].schoolName) list[existingIdx].schoolName = schoolName;
    } else {
      list.push({
        email,
        cie,
        schoolName,
        addedAt: new Date().toISOString()
      });
      added++;
    }
  }

  groups[groupKey] = list;
  await setDoc(doc(db, "config", "email_groups"), {
    groups,
    updatedAt: serverTimestamp()
  }, { merge: true });
  cachedGroups = groups;
  return { groups, added };
}

export async function removeEmailFromGroup(groupKey, emailToRemove) {
  const groups = await getEmailGroups(true);
  const target = String(emailToRemove || "").trim().toLowerCase();
  groups[groupKey] = (groups[groupKey] || []).filter(x => String(x.email || "").toLowerCase() !== target);
  await setDoc(doc(db, "config", "email_groups"), {
    groups,
    updatedAt: serverTimestamp()
  }, { merge: true });
  cachedGroups = groups;
  return groups;
}

export function findUnsavedEmails(groupKey, emailList, groupsObj) {
  const savedSet = new Set(((groupsObj && groupsObj[groupKey]) || []).map(x => String(x.email || "").toLowerCase()));
  return emailList.filter(e => !savedSet.has(String(e).toLowerCase()));
}

// ---------------------------------------------------------------------
// TEMPLATE DO E-MAIL (compatível com Gmail/Outlook: tabelas + cores sólidas)
// ---------------------------------------------------------------------
export function generateEmailHtml({
  system = "agendamento",
  systemLabel = "",
  schoolName = "",
  cie = "",
  osNumber = "",
  customMessage = "",
  surveyLink,
  email
}) {
  const sysCfg = SYSTEMS[system] || SYSTEMS.agendamento;
  const sysTitle = escapeHtml(systemLabel || sysCfg.label);
  const subtitle = escapeHtml(sysCfg.subtitle);
  const school = escapeHtml(schoolName || "Unidade Escolar / Equipe");
  const os = escapeHtml(osNumber || sysCfg.defaultOs);
  const cieTxt = escapeHtml(cie || "–");
  const mail = escapeHtml(email);
  const msgHtml = customMessage && String(customMessage).trim()
    ? `<tr><td style="padding:16px 36px 4px 36px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#fffbeb" style="background:#fffbeb;border:1px solid #fde68a;border-left:4px solid #f5b301;border-radius:10px;">
          <tr><td style="padding:14px 18px;color:#1e293b;font-size:14px;line-height:22px;">
            <div style="font-size:11px;font-weight:700;color:#b45309;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;">Mensagem / Observação</div>
            <div style="white-space:pre-line;">${escapeHtml(String(customMessage).trim())}</div>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const infoBoxesHtml = system === "agendamento"
    ? `<td width="50%" style="padding:14px 18px;border-right:1px solid #e3e8ef;">
         <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Ordem de Serviço</div>
         <div style="font-size:17px;font-weight:700;color:#0b2545;margin-top:3px;">${os}</div></td>
       <td width="50%" style="padding:14px 18px;">
         <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">CIE da Escola</div>
         <div style="font-size:17px;font-weight:700;color:#0b2545;margin-top:3px;">${cieTxt}</div></td>`
    : `<td width="50%" style="padding:14px 18px;border-right:1px solid #e3e8ef;">
         <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Origem / Sistema</div>
         <div style="font-size:16px;font-weight:700;color:#0b2545;margin-top:3px;">${sysTitle}</div></td>
       <td width="50%" style="padding:14px 18px;">
         <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">${cie ? "CIE / Referência" : "Identificação"}</div>
         <div style="font-size:16px;font-weight:700;color:#0b2545;margin-top:3px;">${cie ? `CIE ${cieTxt}` : os}</div></td>`;

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Pesquisa de Satisfação - U.R.E. Sorocaba</title></head>
<body style="margin:0;padding:0;background:#eef2f7;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2f7" style="background:#eef2f7;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dde3ec;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">
    <tr><td height="6" bgcolor="#f5b301" style="height:6px;line-height:6px;font-size:0;background:#f5b301;">&nbsp;</td></tr>
    <tr><td align="center" bgcolor="#0b2545" style="background:#0b2545;padding:30px 24px 26px 24px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;padding:10px;">
        <img src="${logoUrl()}" width="96" alt="U.R.E. Sorocaba" style="display:block;width:96px;max-width:96px;height:auto;border:0;margin:0 auto;">
      </td></tr></table>
      <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">U.R.E. SOROCABA</div>
      <div style="color:#9fb3cf;font-size:13px;margin-top:4px;">${subtitle}</div>
    </td></tr>
    <tr><td align="center" style="padding:30px 32px 6px 32px;">
      <div style="font-size:24px;font-weight:700;color:#0b2545;">Pesquisa de Satisfação</div>
      <div style="font-size:26px;color:#f5b301;letter-spacing:4px;margin-top:6px;">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
    </td></tr>
    <tr><td style="padding:14px 36px 6px 36px;color:#334155;font-size:15px;line-height:24px;">
      <p style="margin:0 0 12px 0;">Olá, <strong>${school}</strong>!</p>
      <p style="margin:0;">Gostaríamos de saber sua opinião sobre o atendimento realizado recentemente (${sysTitle}). Sua avaliação nos ajuda a aprimorar continuamente nossos serviços.</p>
    </td></tr>
    ${msgHtml}
    <tr><td style="padding:20px 36px 4px 36px;">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f6f8fb" style="background:#f6f8fb;border:1px solid #e3e8ef;border-radius:10px;"><tr>
        ${infoBoxesHtml}
      </tr></table>
    </td></tr>
    <tr><td align="center" style="padding:18px 36px 0 36px;color:#475569;font-size:13px;line-height:20px;">
      São apenas <strong>3 perguntas</strong> com notas de <strong>1 a 5 estrelas</strong> + espaço opcional para sugestões<br>
      <span style="color:#64748b;">1 = Ruim &nbsp;•&nbsp; 5 = Ótimo &nbsp;•&nbsp; menos de 1 minuto</span>
    </td></tr>
    <tr><td align="center" style="padding:26px 36px 10px 36px;">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr>
        <td align="center" bgcolor="#16a34a" style="background:#16a34a;border-radius:8px;">
          <a href="${surveyLink}" target="_blank" style="display:inline-block;padding:15px 38px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;font-family:'Segoe UI',Arial,sans-serif;">Responder Pesquisa &rarr;</a>
        </td></tr></table>
    </td></tr>
    <tr><td align="center" style="padding:8px 36px 28px 36px;font-size:12px;color:#94a3b8;line-height:18px;">
      Se o botão não funcionar, copie e cole o link no navegador:<br>
      <a href="${surveyLink}" target="_blank" style="color:#2563eb;word-break:break-all;">${surveyLink}</a>
    </td></tr>
    <tr><td align="center" bgcolor="#f6f8fb" style="background:#f6f8fb;border-top:1px solid #e3e8ef;padding:20px 24px;font-size:12px;color:#64748b;line-height:18px;">
      <strong style="color:#0b2545;">Equipe de Tecnologia — U.R.E. Sorocaba</strong><br>
      Secretaria da Educação do Estado de São Paulo<br>
      <span style="color:#94a3b8;">Mensagem automática enviada para ${mail}. Não é necessário responder.</span>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// ---------------------------------------------------------------------
// ENVIO: cria a pesquisa no Firestore e dispara o e-mail via Power Automate
// ---------------------------------------------------------------------
let cachedWebhook = null;
export async function getWebhookUrl() {
  if (cachedWebhook) return cachedWebhook;
  const snap = await getDoc(doc(db, "config", "app"));
  cachedWebhook = snap.exists() ? (snap.data().webhookUrl || "") : "";
  return cachedWebhook;
}
export async function saveWebhookUrl(url) {
  await setDoc(doc(db, "config", "app"), { webhookUrl: url.trim() }, { merge: true });
  cachedWebhook = url.trim();
}

export async function createAndSendSurvey({
  system = "agendamento",
  cie = "",
  osNumber = "",
  customEmail = null,
  customMessage = "",
  customTitle = "",
  campaign = null
}) {
  const sysCfg = SYSTEMS[system] || SYSTEMS.agendamento;
  let school = cie ? findSchool(cie) : null;

  if (sysCfg.requireSchool && !school) {
    throw new Error(`CIE "${cie}" não encontrado na lista de escolas. O sistema Gestão de Agendamento exige CIE válido.`);
  }
  if (sysCfg.requireOs && !String(osNumber || "").trim()) {
    throw new Error("A Ordem de Serviço (OS) é obrigatória para o sistema Gestão de Agendamento.");
  }

  const targetEmail = (customEmail && String(customEmail).trim())
    ? String(customEmail).trim().toLowerCase()
    : (school ? school.email : "");

  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    throw new Error("Informe um endereço de e-mail válido para envio.");
  }

  // Se não informou CIE mas o e-mail pertence a uma escola (ou está salvo em algum grupo com escola), vincula automaticamente
  if (!school) {
    school = findSchoolByEmail(targetEmail);
    if (!school && cachedGroups) {
      for (const grp of Object.values(cachedGroups)) {
        const found = (grp || []).find(x => String(x.email || "").toLowerCase() === targetEmail && x.cie);
        if (found) { school = findSchool(found.cie) || { cie: found.cie, name: found.schoolName || targetEmail, email: targetEmail }; break; }
      }
    }
  }

  const webhook = await getWebhookUrl();
  if (!webhook) throw new Error("URL do Power Automate não configurada (card Configuração).");

  const resolvedSchoolName = school?.name || (customTitle ? String(customTitle).trim() : targetEmail);
  const resolvedCie = school?.cie || "";
  const resolvedOs = String(osNumber || customTitle || sysCfg.defaultOs).trim();
  const cleanMessage = String(customMessage || "").trim();

  const token = crypto.randomUUID();
  const link = surveyUrl(token);
  await setDoc(doc(db, "surveys", token), {
    system: sysCfg.id,
    systemLabel: sysCfg.label,
    os: resolvedOs,
    cie: resolvedCie,
    schoolName: resolvedSchoolName,
    email: targetEmail,
    customMessage: cleanMessage || null,
    status: "pending",
    q1: null,
    q2: null,
    q3: null,
    comment: null,
    campaign: campaign || sysCfg.label,
    createdAt: serverTimestamp(),
    completedAt: null,
    sentBy: auth.currentUser?.email || null,
    emailStatus: "sending"
  });

  const subjectSuffix = system === "agendamento"
    ? `Atendimento OS: ${resolvedOs}`
    : `${sysCfg.label}${resolvedSchoolName && resolvedSchoolName !== targetEmail ? " - " + resolvedSchoolName : ""}`;

  let emailStatus = "sent";
  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: targetEmail,
        school_name: resolvedSchoolName,
        cie: resolvedCie || "N/A",
        os_number: resolvedOs,
        survey_link: link,
        subject: `Pesquisa de Satisfação - ${subjectSuffix}`,
        body_html: generateEmailHtml({
          system: sysCfg.id,
          systemLabel: sysCfg.label,
          schoolName: resolvedSchoolName,
          cie: resolvedCie,
          osNumber: resolvedOs,
          customMessage: cleanMessage,
          surveyLink: link,
          email: targetEmail
        })
      })
    });
    if (!r.ok) emailStatus = "error_" + r.status;
  } catch (e) {
    emailStatus = "error_network";
  }

  await setDoc(doc(db, "surveys", token), { emailStatus }, { merge: true });
  if (emailStatus !== "sent") throw new Error(`Pesquisa criada, mas o envio do e-mail falhou (${emailStatus}).`);
  return {
    token,
    link,
    school: { cie: resolvedCie, name: resolvedSchoolName, email: targetEmail }
  };
}

// ---------------------------------------------------------------------
// LOGIN (alias "admin" -> angeloruivo@gmail.com)
// ---------------------------------------------------------------------
const LOGIN_ALIASES = {
  "admin": "angeloruivo@gmail.com",
  "angelo": "angeloruivo@gmail.com"
};

export function resolveLoginEmail(input) {
  const raw = String(input || "").trim();
  const key = raw.toLowerCase();
  return LOGIN_ALIASES[key] || raw;
}

export function mountAuth({ loginEl, appEl, userEl, onReady }) {
  const form = loginEl.querySelector("form");
  const msg = loginEl.querySelector(".login-msg");
  form.addEventListener("submit", async e => {
    e.preventDefault();
    msg.textContent = "Entrando...";
    try {
      const email = resolveLoginEmail(form.email.value);
      await signInWithEmailAndPassword(auth, email, form.password.value);
    } catch (err) {
      msg.textContent = "Usuário/e-mail ou senha inválidos.";
    }
  });
  loginEl.querySelector(".forgot")?.addEventListener("click", async e => {
    e.preventDefault();
    if (!form.email.value) { msg.textContent = "Digite seu usuário ou e-mail para redefinir a senha."; return; }
    try {
      const email = resolveLoginEmail(form.email.value);
      await sendPasswordResetEmail(auth, email);
      msg.textContent = `Enviamos um link de redefinição para ${email}.`;
    } catch {
      msg.textContent = "Não foi possível enviar o e-mail de redefinição.";
    }
  });

  onAuthStateChanged(auth, async user => {
    if (!user) { loginEl.hidden = false; appEl.hidden = true; return; }
    loginEl.hidden = true; appEl.hidden = false;
    const label = user.email?.toLowerCase() === "angeloruivo@gmail.com" ? `admin (${user.email})` : (user.email || "");
    if (userEl) userEl.innerHTML = `${escapeHtml(label)} · <a href="#" id="logout">Sair</a>`;
    document.getElementById("logout")?.addEventListener("click", e => { e.preventDefault(); signOut(auth); });
    onReady?.(user);
  });
}
