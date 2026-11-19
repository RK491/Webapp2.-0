import type { LanguageCode } from '../types/farm';

export const LANGUAGE_OPTIONS: { code: LanguageCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'es', label: 'Español' },
  { code: 'ru', label: 'Русский' },
  { code: 'fr', label: 'Français' },
  { code: 'pt', label: 'Português (BR)' },
  { code: 'ar', label: 'العربية' },
];

const DICTIONARY: Record<LanguageCode, {
  farm: string;
  packs: string;
  ranks: string;
  tasks: string;
  friends: string;
  wallet: string;
  collect: string;
  coins: string;
  eggs: string;
  welcomeBack: string;
  deposit: string;
  withdraw: string;
  top10: string;
  profile: string;
  languageAndAudio: string;
  languageLabel: string;
  music: string;
  sounds: string;
  basketFullAlerts: string;
  darkMode: string;
  muteAll: string;
  unmuteAll: string;
}> = {
  en: {
    farm: 'Farm',
    packs: 'Packs',
    ranks: 'Ranks',
    tasks: 'Tasks',
    friends: 'Friends',
    wallet: 'Wallet',
    collect: 'Collect',
    coins: 'COINS',
    eggs: 'EGGS',
    welcomeBack: 'Welcome back!',
    deposit: 'Deposit',
    withdraw: 'Withdraw',
    top10: 'Top 10',
    profile: 'Profile',
    languageAndAudio: 'Language & Audio',
    languageLabel: 'Language',
    music: 'Music',
    sounds: 'Sounds',
    basketFullAlerts: 'Basket Full Alerts',
    darkMode: 'Dark Mode',
    muteAll: 'Mute All',
    unmuteAll: 'Unmute All',
  },
  hi: {
    farm: 'फ़ार्म',
    packs: 'पैक',
    ranks: 'रैंक',
    tasks: 'टास्क',
    friends: 'दोस्त',
    wallet: 'वॉलेट',
    collect: 'इकट्ठा करें',
    coins: 'सिक्के',
    eggs: 'अंडे',
    welcomeBack: 'वापसी पर स्वागत है!',
    deposit: 'जमा करें',
    withdraw: 'निकासी',
    top10: 'टॉप 10',
    profile: 'प्रोफ़ाइल',
    languageAndAudio: 'भाषा और ऑडियो',
    languageLabel: 'भाषा',
    music: 'संगीत',
    sounds: 'ध्वनि',
    basketFullAlerts: 'टोकरी भरने का अलर्ट',
    darkMode: 'डार्क मोड',
    muteAll: 'सभी म्यूट',
    unmuteAll: 'अनम्यूट',
  },
  es: {
    farm: 'Granja',
    packs: 'Packs',
    ranks: 'Ranking',
    tasks: 'Tareas',
    friends: 'Amigos',
    wallet: 'Billetera',
    collect: 'Recoger',
    coins: 'MONEDAS',
    eggs: 'HUEVOS',
    welcomeBack: '¡Bienvenido!',
    deposit: 'Depositar',
    withdraw: 'Retirar',
    top10: 'Top 10',
    profile: 'Perfil',
    languageAndAudio: 'Idioma y Audio',
    languageLabel: 'Idioma',
    music: 'Música',
    sounds: 'Sonidos',
    basketFullAlerts: 'Alertas de cesta llena',
    darkMode: 'Modo oscuro',
    muteAll: 'Silenciar',
    unmuteAll: 'Activar',
  },
  ru: {
    farm: 'Ферма',
    packs: 'Куры',
    ranks: 'Топ',
    tasks: 'Задания',
    friends: 'Друзья',
    wallet: 'Кошелёк',
    collect: 'Собрать',
    coins: 'МОНЕТЫ',
    eggs: 'ЯЙЦА',
    welcomeBack: 'С возвращением!',
    deposit: 'Пополнить',
    withdraw: 'Вывести',
    top10: 'Топ 10',
    profile: 'Профиль',
    languageAndAudio: 'Язык и звук',
    languageLabel: 'Язык',
    music: 'Музыка',
    sounds: 'Звуки',
    basketFullAlerts: 'Уведомления корзины',
    darkMode: 'Тёмная тема',
    muteAll: 'Без звука',
    unmuteAll: 'Вкл. звук',
  },
  fr: {
    farm: 'Ferme',
    packs: 'Packs',
    ranks: 'Classement',
    tasks: 'Tâches',
    friends: 'Amis',
    wallet: 'Portefeuille',
    collect: 'Collecter',
    coins: 'PIÈCES',
    eggs: 'ŒUFS',
    welcomeBack: 'Bon retour !',
    deposit: 'Dépôt',
    withdraw: 'Retrait',
    top10: 'Top 10',
    profile: 'Profil',
    languageAndAudio: 'Langue et Audio',
    languageLabel: 'Langue',
    music: 'Musique',
    sounds: 'Sons',
    basketFullAlerts: 'Alertes panier plein',
    darkMode: 'Mode sombre',
    muteAll: 'Tout couper',
    unmuteAll: 'Réactiver',
  },
  pt: {
    farm: 'Fazenda',
    packs: 'Pacotes',
    ranks: 'Ranking',
    tasks: 'Tarefas',
    friends: 'Amigos',
    wallet: 'Carteira',
    collect: 'Coletar',
    coins: 'MOEDAS',
    eggs: 'OVOS',
    welcomeBack: 'Bem-vindo!',
    deposit: 'Depositar',
    withdraw: 'Sacar',
    top10: 'Top 10',
    profile: 'Perfil',
    languageAndAudio: 'Idioma e Áudio',
    languageLabel: 'Idioma',
    music: 'Música',
    sounds: 'Sons',
    basketFullAlerts: 'Alertas de cesta cheia',
    darkMode: 'Modo escuro',
    muteAll: 'Silenciar',
    unmuteAll: 'Ativar som',
  },
  ar: {
    farm: 'المزرعة',
    packs: 'الباقات',
    ranks: 'الترتيب',
    tasks: 'المهام',
    friends: 'الأصدقاء',
    wallet: 'المحفظة',
    collect: 'جمع',
    coins: 'عملات',
    eggs: 'بيض',
    welcomeBack: 'مرحباً بعودتك!',
    deposit: 'إيداع',
    withdraw: 'سحب',
    top10: 'أفضل 10',
    profile: 'الملف',
    languageAndAudio: 'اللغة والصوت',
    languageLabel: 'اللغة',
    music: 'الموسيقى',
    sounds: 'الأصوات',
    basketFullAlerts: 'تنبيهات امتلاء السلة',
    darkMode: 'الوضع الداكن',
    muteAll: 'كتم الكل',
    unmuteAll: 'إلغاء الكتم',
  },
};

export function isValidLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && value in DICTIONARY;
}

const LANGUAGE_STORAGE_PREFIX = 'chickenland_language_v1';

export function getStoredLanguage(playerId?: string): LanguageCode {
  if (typeof window === 'undefined') return 'en';
  try {
    const perPlayer = playerId
      ? window.localStorage.getItem(`${LANGUAGE_STORAGE_PREFIX}_${playerId}`)
      : null;
    if (isValidLanguageCode(perPlayer)) return perPlayer;
    const globalSaved = window.localStorage.getItem(LANGUAGE_STORAGE_PREFIX);
    if (isValidLanguageCode(globalSaved)) return globalSaved;
  } catch {
    // Ignore storage errors
  }
  return 'en';
}

export function setStoredLanguage(lang: LanguageCode, playerId?: string): void {
  if (typeof window === 'undefined' || !isValidLanguageCode(lang)) return;
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_PREFIX, lang);
    if (playerId) {
      window.localStorage.setItem(`${LANGUAGE_STORAGE_PREFIX}_${playerId}`, lang);
    }
  } catch {
    // Ignore storage errors
  }
}

export function t(lang: LanguageCode) {
  return DICTIONARY[lang] ?? DICTIONARY.en;
}

