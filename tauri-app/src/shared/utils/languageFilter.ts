/**
 * Sistema de filtro de linguagem para chat
 *
 * Filtra palavras inadequadas e substitui por asteriscos
 * Inclui palavras em português e variações comuns
 */

// Lista enxuta: saíram termos neutros (nacionalidades, drogas, "mental", "gay"...)
// que geravam falso positivo em conversas normais de suporte.
const FILTERED_WORDS = [
  // Palavrões
  'porra', 'caralho', 'merda', 'bosta', 'cacete', 'cassete', 'puta', 'putaria', 'puteiro',
  'foder', 'fodeu', 'fodido', 'fodase', 'foda-se',

  // Termos sexuais
  'buceta', 'bucetuda', 'xoxota', 'xereca', 'xereka', 'xana', 'xaninha', 'pepeca', 'ppk',
  'cu', 'cuzao', 'cuzão', 'cuzona', 'piroca',

  // Insultos
  'desgraca', 'desgraça', 'desgraçado', 'desgraçada', 'babaca', 'canalha',
  'corno', 'corna', 'cornudo', 'cornuda', 'idiota', 'imbecil', 'otario', 'otária',
  'burro', 'burra', 'trouxa', 'retardado', 'retardada', 'mongoloide', 'mongolóide',
  'nojento', 'nojenta', 'seboso', 'sebosa', 'vagabundo', 'vagabunda', 'vadio', 'vadia',
  'piranha', 'prostituta', 'prostituto', 'safado', 'safada', 'tarado', 'tarada',
  'viado', 'veado', 'bicha', 'sapatao', 'sapatão', 'traveco',

  // Expressões
  'vai se foder', 'va se foder', 'vá se foder', 'vai si fuder', 'vai tomar no cu',
  'que merda', 'que bosta', 'que porra', 'que caralho', 'puta merda', 'puta que pariu',
  'filho da puta', 'filha da puta', 'filhadaputa',
  'da no cu', 'dá no cu', 'enfia no cu', 'mete no cu', 'pau no cu',

  // Abreviações
  'fdp', 'pqp', 'vtnc', 'vsf', 'vsfd', 'krl', 'krh', 'crl', 'kct', 'pnc',

  // Variações com números/caracteres especiais
  'p0rr4', 'c4r4lh0', 'm3rd4', 'f0d3r', 'f0d3u',
  'p*rra', 'c*ralho', 'm*rda', 'b*sta', 'f*der', 'c*cete', 'p*ta', 'b*ceta', 'c*zao',
];

export interface FilterResult {
  isFiltered: boolean;
  originalText: string;
  filteredText: string;
  detectedWords: string[];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Normalizar texto para busca (remover acentos, converter para minúsculas)
const normalizeForSearch = (str: string) =>
  str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, ''); // Remove caracteres especiais

const mask = (match: string) => '*'.repeat(match.length);

/**
 * Filtra linguagem inadequada de um texto
 * @param text Texto a ser filtrado
 * @param strictMode Se true, usa filtragem mais rigorosa (casa trechos parciais)
 * @returns Resultado da filtragem
 */
export function filterLanguage(text: string, strictMode: boolean = false): FilterResult {
  const originalText = text;
  let filteredText = text;
  const detectedWords: string[] = [];
  const normalizedText = normalizeForSearch(text);

  for (const word of FILTERED_WORDS) {
    const normalizedWord = normalizeForSearch(word);
    if (!normalizedWord) continue;

    // Palavra inteira (\b) evita falso positivo do tipo "cu" dentro de "computador".
    const wholeWord = new RegExp(`\\b${escapeRegExp(normalizedWord)}\\b`, 'i');
    const hit = strictMode ? normalizedText.includes(normalizedWord) : wholeWord.test(normalizedText);
    if (!hit) continue;

    detectedWords.push(word);
    filteredText = filteredText
      .replace(new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi'), mask)
      .replace(new RegExp(`\\b${escapeRegExp(normalizedWord)}\\b`, 'gi'), mask);

    // Modo strict: também mascara ocorrências parciais
    if (strictMode) {
      filteredText = filteredText.replace(new RegExp(escapeRegExp(normalizedWord), 'gi'), mask);
    }
  }

  return {
    isFiltered: detectedWords.length > 0,
    originalText,
    filteredText,
    detectedWords
  };
}

/**
 * Verifica se um texto contém linguagem inadequada sem filtrar
 * @param text Texto a ser verificado
 * @returns true se contém linguagem inadequada
 */
export function containsInappropriateLanguage(text: string): boolean {
  return filterLanguage(text).isFiltered;
}

/**
 * Configurações do filtro de linguagem
 */
export interface LanguageFilterSettings {
  enabled: boolean;
  strictMode: boolean;
  showWarningMessage: boolean;
  blockMessage: boolean; // Se true, bloqueia envio; se false, só filtra
}

/**
 * Configurações padrão do filtro
 */
export const DEFAULT_FILTER_SETTINGS: LanguageFilterSettings = {
  enabled: true,
  strictMode: false,
  showWarningMessage: true,
  blockMessage: false
};

/**
 * Processa mensagem com filtro de linguagem baseado nas configurações
 * @param text Texto da mensagem
 * @param settings Configurações do filtro
 * @returns Resultado do processamento
 */
export function processMessageWithFilter(
  text: string,
  settings: LanguageFilterSettings = DEFAULT_FILTER_SETTINGS
): FilterResult & { shouldBlock: boolean; warningMessage?: string } {
  if (!settings.enabled) {
    return {
      isFiltered: false,
      originalText: text,
      filteredText: text,
      detectedWords: [],
      shouldBlock: false
    };
  }

  const result = filterLanguage(text, settings.strictMode);

  return {
    ...result,
    shouldBlock: settings.blockMessage && result.isFiltered,
    warningMessage: result.isFiltered && settings.showWarningMessage
      ? 'Mensagem contém linguagem inadequada e foi filtrada automaticamente.'
      : undefined
  };
}
