// /api/subscribe.js
// Função serverless (Vercel) que recebe email + whatsapp do formulário
// de captura da Yātra e cria/atualiza o contato na Brevo.
//
// A chave da API NUNCA fica neste arquivo. Ela é lida de uma variável
// de ambiente configurada direto no painel da Vercel:
//   Project > Settings > Environment Variables
//     BREVO_API_KEY = sua chave da Brevo (SMTP & API > API Keys)
//     BREVO_LIST_ID = id numérico da lista de contatos na Brevo
//
// Depois de configurar as variáveis, faça um redeploy para que elas
// entrem em vigor.

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = (body.email || '').trim();
    const whatsapp = (body.whatsapp || '').trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (!whatsapp || whatsapp.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ error: 'WhatsApp inválido.' });
    }

    // Brevo exige o WHATSAPP em formato internacional (E.164), só dígitos
    // com o "+" na frente, ex: +5511987654321. Nosso input só tem o
    // formato nacional (DDD + número), então adicionamos o código do
    // Brasil (55) quando ele ainda não estiver presente.
    var waDigits = whatsapp.replace(/\D/g, '');
    if (waDigits.length <= 11) {
      waDigits = '55' + waDigits;
    }
    var whatsappE164 = '+' + waDigits;

    const apiKey = process.env.BREVO_API_KEY;
    const listId = process.env.BREVO_LIST_ID;

    if (!apiKey || !listId) {
      console.error('Faltando BREVO_API_KEY ou BREVO_LIST_ID nas variáveis de ambiente.');
      return res.status(500).json({ error: 'Configuração ausente no servidor.' });
    }

    const brevoRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify({
        email: email,
        attributes: { WHATSAPP: whatsappE164 },
        listIds: [Number(listId)],
        updateEnabled: true
      })
    });

    if (brevoRes.ok || brevoRes.status === 204) {
      return res.status(200).json({ ok: true });
    }

    const errBody = await brevoRes.json().catch(function () { return {}; });

    // contato já existente na lista: não é erro do ponto de vista do usuário
    if (errBody.code === 'duplicate_parameter') {
      return res.status(200).json({ ok: true });
    }

    console.error('Erro Brevo:', errBody);
    return res.status(502).json({ error: 'Falha ao salvar contato.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Erro interno.' });
  }
};
