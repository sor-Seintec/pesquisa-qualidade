// Template do e-mail da Pesquisa de Satisfação - U.R.E. Sorocaba
// Observação: Gmail/Outlook bloqueiam imagens embutidas em base64 (data:image).
// Por isso o logo precisa estar hospedado em uma URL pública (LOGO_URL no .env).

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function generateEmailHtml({ schoolName, cie, osNumber, surveyLink, email }) {
    const logoUrl = (process.env.LOGO_URL || '').trim();
    const school = escapeHtml(schoolName);
    const os = escapeHtml(osNumber);
    const cieTxt = escapeHtml(cie);
    const mail = escapeHtml(email);

    // Logo hospedado (se configurado) ou emblema em texto (fallback que nunca quebra)
    const logoBlock = logoUrl
        ? `<img src="${logoUrl}" width="96" alt="U.R.E. Sorocaba" style="display:block;width:96px;max-width:96px;height:auto;border:0;margin:0 auto;">`
        : `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
             <tr><td width="88" height="88" align="center" valign="middle" bgcolor="#ffffff"
                     style="width:88px;height:88px;border-radius:44px;background:#ffffff;font-family:Georgia,'Times New Roman',serif;color:#0b2545;">
               <div style="font-size:20px;font-weight:bold;line-height:22px;">U.R.E.</div>
               <div style="font-size:9px;letter-spacing:1px;line-height:12px;">SOROCABA</div>
             </td></tr>
           </table>`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pesquisa de Satisfação - U.R.E. Sorocaba</title>
</head>
<body style="margin:0;padding:0;background:#eef2f7;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#eef2f7" style="background:#eef2f7;">
<tr><td align="center" style="padding:28px 12px;">

  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #dde3ec;font-family:'Segoe UI',Arial,Helvetica,sans-serif;">

    <!-- Faixa superior colorida -->
    <tr><td height="6" bgcolor="#f5b301" style="height:6px;line-height:6px;font-size:0;background:#f5b301;">&nbsp;</td></tr>

    <!-- Cabeçalho -->
    <tr>
      <td align="center" bgcolor="#0b2545" style="background:#0b2545;padding:30px 24px 26px 24px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
          <tr><td align="center" bgcolor="#ffffff" style="background:#ffffff;border-radius:14px;padding:10px;">
            ${logoBlock}
          </td></tr>
        </table>
        <div style="height:16px;line-height:16px;font-size:0;">&nbsp;</div>
        <div style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:1px;">U.R.E. SOROCABA</div>
        <div style="color:#9fb3cf;font-size:13px;margin-top:4px;">Suporte de Tecnologia às Unidades Escolares</div>
      </td>
    </tr>

    <!-- Título -->
    <tr>
      <td align="center" style="padding:30px 32px 6px 32px;">
        <div style="font-size:24px;font-weight:700;color:#0b2545;">Pesquisa de Satisfação</div>
        <div style="font-size:26px;color:#f5b301;letter-spacing:4px;margin-top:6px;">&#9733;&#9733;&#9733;&#9733;&#9733;</div>
      </td>
    </tr>

    <!-- Texto -->
    <tr>
      <td style="padding:14px 36px 6px 36px;color:#334155;font-size:15px;line-height:24px;">
        <p style="margin:0 0 12px 0;">Olá, <strong>${school}</strong>!</p>
        <p style="margin:0;">Gostaríamos de saber sua opinião sobre o atendimento de tecnologia realizado recentemente em sua escola. Sua avaliação nos ajuda a melhorar continuamente nossos serviços.</p>
      </td>
    </tr>

    <!-- Detalhes do atendimento -->
    <tr>
      <td style="padding:20px 36px 4px 36px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f6f8fb" style="background:#f6f8fb;border:1px solid #e3e8ef;border-radius:10px;">
          <tr>
            <td width="50%" style="padding:14px 18px;border-right:1px solid #e3e8ef;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">Ordem de Serviço</div>
              <div style="font-size:17px;font-weight:700;color:#0b2545;margin-top:3px;">${os}</div>
            </td>
            <td width="50%" style="padding:14px 18px;">
              <div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;">CIE da Escola</div>
              <div style="font-size:17px;font-weight:700;color:#0b2545;margin-top:3px;">${cieTxt}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Aviso escala -->
    <tr>
      <td align="center" style="padding:18px 36px 0 36px;color:#475569;font-size:13px;line-height:20px;">
        São apenas <strong>3 perguntas</strong> com notas de <strong>1 a 5 estrelas</strong><br>
        <span style="color:#64748b;">1 = Ruim &nbsp;•&nbsp; 5 = Ótimo &nbsp;•&nbsp; menos de 1 minuto</span>
      </td>
    </tr>

    <!-- Botão -->
    <tr>
      <td align="center" style="padding:26px 36px 10px 36px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center">
          <tr>
            <td align="center" bgcolor="#16a34a" style="background:#16a34a;border-radius:8px;">
              <a href="${surveyLink}" target="_blank" style="display:inline-block;padding:15px 38px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;font-family:'Segoe UI',Arial,sans-serif;">
                Responder Pesquisa &rarr;
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>

    <!-- Link alternativo -->
    <tr>
      <td align="center" style="padding:8px 36px 28px 36px;font-size:12px;color:#94a3b8;line-height:18px;">
        Se o botão não funcionar, copie e cole o link no navegador:<br>
        <a href="${surveyLink}" target="_blank" style="color:#2563eb;word-break:break-all;">${surveyLink}</a>
      </td>
    </tr>

    <!-- Rodapé -->
    <tr>
      <td align="center" bgcolor="#f6f8fb" style="background:#f6f8fb;border-top:1px solid #e3e8ef;padding:20px 24px;font-size:12px;color:#64748b;line-height:18px;">
        <strong style="color:#0b2545;">Equipe de Tecnologia — U.R.E. Sorocaba</strong><br>
        Secretaria da Educação do Estado de São Paulo<br>
        <span style="color:#94a3b8;">Mensagem automática enviada para ${mail}. Não é necessário responder.</span>
      </td>
    </tr>

  </table>

</td></tr>
</table>
</body>
</html>`;
}

module.exports = { generateEmailHtml };
