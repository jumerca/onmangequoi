const OFFICIAL_DOMAINS = [
  'legifrance.gouv.fr',
  'code.travail.gouv.fr',
  'service-public.fr',
  'justice.fr',
  'courdecassation.fr',
  'conseil-etat.fr',
  'cnil.fr'
];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store'
};

const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json; charset=utf-8' };

const RESPONSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict','verified_at','facts','rules','application','exceptions','risks','deadlines','evidence','actions','confidence','sources'],
  properties: {
    verdict: { type: 'string' },
    verified_at: { type: 'string' },
    facts: { type: 'array', items: { type: 'string' } },
    rules: { type: 'array', items: { type: 'string' } },
    application: { type: 'string' },
    exceptions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    deadlines: { type: 'array', items: { type: 'string' } },
    evidence: { type: 'array', items: { type: 'string' } },
    actions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title','url','note'],
        properties: {
          title: { type: 'string' },
          url: { type: 'string' },
          note: { type: 'string' }
        }
      }
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function extractOutputText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  const chunks = [];
  for (const item of data.output || []) {
    if (item.type !== 'message') continue;
    for (const c of item.content || []) {
      if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') chunks.push(c.text);
    }
  }
  return chunks.join('\n').trim();
}

function isOfficialUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return OFFICIAL_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch {
    return false;
  }
}

function sanitize(result) {
  result.sources = (result.sources || []).filter(s => isOfficialUrl(s.url));
  if (!result.sources.length) {
    result.confidence = 'insuffisante — aucune source officielle exploitable n’a été conservée';
    if (!String(result.verdict || '').toUpperCase().includes('INSUFFIS')) result.verdict = 'INFORMATIONS INSUFFISANTES';
  }
  return result;
}

function systemInstructions(mode) {
  const counter = mode === 'counter';
  return `Tu es JurisPilot, assistant d'information juridique spécialisé en droit français. Date de référence utilisateur : Europe/Paris.\n\nRÈGLES ABSOLUES :\n- Tu DOIS utiliser la recherche web pendant cette réponse.\n- Pour toute proposition juridique concrète, vérifie la règle sur des sources officielles françaises actuelles.\n- Sources autorisées comme fondement : ${OFFICIAL_DOMAINS.join(', ')}.\n- Ne crée jamais un numéro d'article, une décision, une date, un délai, un intitulé de convention ou une citation.\n- Si un point n'est pas vérifiable, écris-le explicitement et ne l'utilise pas pour affirmer un verdict.\n- Vérifie la version en vigueur à la date pertinente. Si la question concerne une période passée, distingue le droit applicable à cette date du droit actuel.\n- En droit du travail, raisonne dans cet ordre : loi/règlement, convention ou accord pertinent, contrat de travail, faits et jurisprudence utile. L'IDCC ou la convention peut être déterminant.\n- Distingue modification des conditions de travail et modification du contrat lorsque pertinent, sans présumer la qualification.\n- Cite dans rules le numéro exact des articles uniquement si tu les as réellement vérifiés.\n- Les sources retournées doivent pointer vers les pages officielles réellement utilisées, jamais vers une page inventée.\n- Reste concret et compréhensible. Ne prétends pas être avocat et ne promets aucun résultat judiciaire.\n${counter ? '- CONTRE-ANALYSE : cherche activement les exceptions, qualifications alternatives, textes spéciaux, clauses/conventions possibles et jurisprudences qui pourraient fragiliser ou inverser la première analyse. Ne répète pas simplement la conclusion initiale.' : '- ANALYSE : cherche suffisamment pour tester la conclusion initiale, y compris les exceptions importantes et les règles plus favorables ou spéciales.'}\n\nVERDICT : utilise de préférence OUI, NON, ÇA DÉPEND ou INFORMATIONS INSUFFISANTES, avec une courte précision si nécessaire.\nCONFIDENCE : élevée / moyenne / faible / insuffisante, et explique brièvement la raison dans cette même chaîne.\nRetourne strictement l'objet JSON demandé.`;
}

async function runLegalAnalysis(env, body, mode) {
  const question = String(body.question || '').trim();
  if (!question) throw new Error('Question manquante');
  if (question.length > 12000) throw new Error('Question trop longue');

  const input = {
    question,
    domaine_estime: body.domain || 'non précisé',
    mode_urgence: !!body.urgent,
    profil_professionnel: body.profile || {},
    analyse_precedente: mode === 'counter' ? (body.previous_analysis || null) : null,
    date_client: body.client_date || null
  };

  const request = {
    model: 'gpt-5.6-sol',
    reasoning: { effort: 'high' },
    instructions: systemInstructions(mode),
    input: JSON.stringify(input),
    tools: [{ type: 'web_search' }],
    tool_choice: 'required',
    include: ['web_search_call.action.sources'],
    text: {
      format: {
        type: 'json_schema',
        name: 'jurispilot_legal_analysis',
        strict: true,
        schema: RESPONSE_SCHEMA
      }
    },
    store: false
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(request)
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message || `Erreur moteur HTTP ${response.status}`;
    throw new Error(msg);
  }

  const text = extractOutputText(data);
  if (!text) throw new Error('Réponse moteur vide');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { throw new Error('Réponse moteur non conforme au format juridique'); }

  parsed.verified_at = parsed.verified_at || new Date().toISOString();
  return sanitize(parsed);
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/health') {
      return json({
        ok: true,
        version: '2.0',
        engine: env.OPENAI_API_KEY ? 'ready' : 'missing-key',
        legal_sources: 'official-web-search',
        piste_direct_api: !!(env.PISTE_CLIENT_ID && env.PISTE_CLIENT_SECRET),
        judilibre_direct_api: !!env.JUDILIBRE_KEY_ID
      });
    }

    const mode = url.pathname === '/counter-analyze' ? 'counter' : url.pathname === '/analyze' ? 'analyze' : null;
    if (request.method === 'POST' && mode) {
      if (!env.OPENAI_API_KEY) return json({ error: 'Moteur juridique non configuré côté serveur.' }, 503);
      try {
        const body = await request.json();
        return json(await runLegalAnalysis(env, body, mode));
      } catch (e) {
        return json({ error: e?.message || 'Erreur d’analyse juridique.' }, 500);
      }
    }

    return json({ error: 'Route inconnue' }, 404);
  }
};
