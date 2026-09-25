/**
 * Icon — the site's entire icon set as inline SVG.
 *
 * Why this file exists: the app used to lean on emoji for every glyph. Emoji
 * render differently on every OS, cannot be recoloured, break the mint design
 * language and are read aloud by screen readers as names. Every glyph in the
 * product is now drawn here as SVG so it inherits `currentColor`, scales with
 * the text and looks identical on Windows, macOS and phones.
 *
 * Usage:
 *   <Icon name="bulb" />                  size follows the font (1em)
 *   <Icon name="bulb" size={18} />        fixed pixels
 *   <Icon name="shield" className="x" />  extra classes
 *   <Icon name="shield" title="Private" /> becomes an announced image
 *
 * Rules for new icons: 24x24 grid, 1.8 stroke, round caps/joins, no fills
 * unless the shape is genuinely solid (then fill="currentColor").
 */

/* Each entry is the inner markup of a 24x24 viewBox. */
const ICONS = {
  /* --- navigation / chrome --- */
  home: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  repeat: <><path d="M4 9a5 5 0 0 1 5-5h9" /><path d="m15 1 3 3-3 3" /><path d="M20 15a5 5 0 0 1-5 5H6" /><path d="m9 23-3-3 3-3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  tag: <><path d="M3 12.5V5a2 2 0 0 1 2-2h7.5L21 11.5 12.5 20 3 12.5Z" /><circle cx="7.5" cy="7.5" r="1.4" /></>,
  wallet: <><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3" /><path d="M3 7.5V17a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2" /><path d="M21 10h-4a2 2 0 0 0 0 4h4" /></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  chartUp: <><path d="M3 17 9 11l4 4 7-7" /><path d="M15 8h5v5" /></>,
  sparkles: <><path d="M12 3.5 13.6 8 18 9.6 13.6 11.2 12 15.6 10.4 11.2 6 9.6 10.4 8 12 3.5Z" /><path d="M18.5 15.5 19.3 17.5 21.3 18.3 19.3 19.1 18.5 21.1 17.7 19.1 15.7 18.3 17.7 17.5 18.5 15.5Z" /></>,
  bulb: <><path d="M9 17.5a6 6 0 1 1 6 0v1.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 19v-1.5Z" /><path d="M9.5 17.5h5" /></>,
  bookmark: <><path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4-7 4V4.5a1 1 0 0 1 1-1Z" /></>,
  pin: <><path d="M9 3.5h6l-1 5 3.5 3.5H6.5L10 8.5 9 3.5Z" /><path d="M12 12v8.5" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  users: <><circle cx="9" cy="8" r="3.4" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 5.2a3.4 3.4 0 0 1 0 6.6M17.5 14.4A6.5 6.5 0 0 1 21.5 20" /></>,
  grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="4" cy="6" r="1.1" fill="currentColor" /><circle cx="4" cy="12" r="1.1" fill="currentColor" /><circle cx="4" cy="18" r="1.1" fill="currentColor" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  check: <><path d="m4.5 12.5 5 5 10-11" /></>,
  close: <><path d="M6 6l12 12M18 6 6 18" /></>,
  chevronDown: <><path d="m6 9.5 6 6 6-6" /></>,
  chevronRight: <><path d="m9.5 6 6 6-6 6" /></>,
  arrowRight: <><path d="M4 12h16" /><path d="m14 6 6 6-6 6" /></>,
  arrowLeft: <><path d="M20 12H4" /><path d="m10 6-6 6 6 6" /></>,
  arrowUp: <><path d="M12 20V4" /><path d="m6 10 6-6 6 6" /></>,
  play: <><path d="M8 5.5 18.5 12 8 18.5v-13Z" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  filter: <><path d="M3.5 5.5h17l-6.5 8v5.5l-4 2v-7.5l-6.5-8Z" /></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
  dots: <><circle cx="5.5" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="18.5" cy="12" r="1.5" fill="currentColor" /></>,
  more: <><circle cx="5" cy="12" r="1.6" fill="currentColor" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /><circle cx="19" cy="12" r="1.6" fill="currentColor" /></>,

  /* --- money --- */
  coin: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5v9M14.8 9.8a3 3 0 0 0-2.8-1.3c-1.6 0-2.8.8-2.8 2s1.1 1.7 2.8 2 2.9.8 2.9 2-1.2 2-2.9 2a3.1 3.1 0 0 1-2.9-1.4" /></>,
  coins: <><ellipse cx="9" cy="6.5" rx="5.5" ry="2.6" /><path d="M3.5 6.5v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4" /><path d="M8 14.8c-2.6-.2-4.5-1.2-4.5-2.4v3.9c0 1.4 2.5 2.6 5.5 2.6 1 0 2-.1 2.8-.4" /><path d="M14.5 10.5c3 .2 5 1.3 5 2.6v4c0 1.4-2.5 2.6-5.5 2.6s-5.5-1.2-5.5-2.6v-3.6" /></>,
  card: <><rect x="2.5" y="5" width="19" height="14" rx="3" /><path d="M2.5 10h19" /><path d="M6 14.5h4" /></>,
  cash: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.1M18 14.5v.1" /></>,
  bank: <><path d="M3 9.5 12 4l9 5.5" /><path d="M5.5 10.5v8M18.5 10.5v8M9.5 10.5v8M14.5 10.5v8" /><path d="M3 20h18" /></>,
  target: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></>,
  piggy: <><path d="M4 12.5c0-3.6 3.2-6 7.5-6 1.2 0 2.3.2 3.3.6L18 5v4c1 .8 1.6 1.8 2 3l1 .5v3l-2.2-.4a7.9 7.9 0 0 1-3.1 1.4V19H13v-1.4c-.5.1-1 .1-1.5.1s-1 0-1.5-.1V19H7.5v-1.9A5.6 5.6 0 0 1 4 12.5Z" /><circle cx="15" cy="11.5" r="1" fill="currentColor" /><path d="M7 9.5 6 7l3 .8" /></>,
  trendUp: <><path d="M4 16.5 9.5 11l3.5 3.5L20 7.5" /><path d="M15.5 7.5H20V12" /></>,
  trendDown: <><path d="M4 7.5 9.5 13l3.5-3.5L20 16.5" /><path d="M15.5 16.5H20V12" /></>,
  trendFlat: <><path d="M4 12h16" /></>,
  scale: <><path d="M12 4v16" /><path d="M6 8h12" /><path d="m6 8-3 6h6L6 8ZM18 8l-3 6h6l-3-6Z" /><path d="M8 20h8" /></>,

  /* --- categories (student life) --- */
  cup: <><path d="M5 7h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V7Z" /><path d="M17 8.5h1.8a2.2 2.2 0 0 1 0 4.4H17" /><path d="M4 21.5h14" /></>,
  bus: <><rect x="4" y="3.5" width="16" height="14" rx="3" /><path d="M4 10h16" /><circle cx="8" cy="14" r="1.2" fill="currentColor" /><circle cx="16" cy="14" r="1.2" fill="currentColor" /><path d="M7 17.5V20M17 17.5V20" /></>,
  book: <><path d="M4 5.5A2 2 0 0 1 6 3.5h5v17H6a2 2 0 0 1-2-2v-13Z" /><path d="M20 5.5a2 2 0 0 0-2-2h-5v17h5a2 2 0 0 0 2-2v-13Z" /></>,
  books: <><path d="M5 4.5h4v15H5a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 5 4.5Z" /><path d="M10.5 4.5h4v15h-4z" /><path d="M16 4.5h3a1.5 1.5 0 0 1 1.5 1.5v12a1.5 1.5 0 0 1-1.5 1.5h-3z" /></>,
  gift: <><rect x="3.5" y="9" width="17" height="4" rx="1" /><path d="M5 13v6.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V13" /><path d="M12 9v12" /><path d="M12 9S10.5 3.5 8 4.2 9.5 9 12 9Zm0 0s1.5-5.5 4-4.8S14.5 9 12 9Z" /></>,
  film: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M8 5v14M16 5v14M3 12h18" /></>,
  gamepad: <><path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.5l-.7 3.2a2.4 2.4 0 0 1-4.2.8L14.5 16h-5l-1.5 1.5a2.4 2.4 0 0 1-4.2-.8L3 13.5A4.5 4.5 0 0 1 7.5 8Z" /><path d="M7 11v2.5M5.8 12.2h2.4" /><circle cx="16" cy="12" r="1" fill="currentColor" /><circle cx="18" cy="13.8" r="1" fill="currentColor" /></>,
  house: <><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9.5V20.5h13V9.5" /><path d="M10 20.5v-5.5h4v5.5" /></>,
  briefcase: <><rect x="3" y="7.5" width="18" height="12" rx="2.5" /><path d="M9 7.5V5.5a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 5.5v2" /><path d="M3 12.5h18" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.6-1 7.4 4.5-2.4 4.5 2.4-1-7.4" /></>,
  shirt: <><path d="M8.5 3.5 12 6l3.5-2.5 5 2.8-2.4 3.7-2.1-1v11.5H8V8.9l-2.1 1L3.5 6.2l5-2.7Z" /></>,
  health: <><path d="M12 20.5S3.5 15.4 3.5 9.6A4.6 4.6 0 0 1 12 6.9a4.6 4.6 0 0 1 8.5 2.7c0 5.8-8.5 10.9-8.5 10.9Z" /></>,
  phone: <><rect x="6.5" y="2.5" width="11" height="19" rx="3" /><path d="M10.5 18.5h3" /></>,
  laptop: <><rect x="4" y="5" width="16" height="10" rx="2" /><path d="M2 18.5h20" /></>,
  plusCircle: <><circle cx="12" cy="12" r="8.5" /><path d="M12 8.5v7M8.5 12h7" /></>,

  /* --- food --- */
  burger: <><path d="M4 9.5a8 8 0 0 1 16 0H4Z" /><path d="M3 12.5h18M3 16.5h18" /><path d="M5 12.5a7 7 0 0 0 14 0M5 16.5a7 7 0 0 0 14 0" /><path d="M4 19.5c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 1.5-1 2.5-.5" /></>,
  pizza: <><path d="M12 3.5 21 20H3L12 3.5Z" /><circle cx="12" cy="11" r="1.6" fill="currentColor" /><circle cx="9" cy="16" r="1.4" fill="currentColor" /><circle cx="15.5" cy="15" r="1.4" fill="currentColor" /></>,

  /* --- status / feedback --- */
  shield: <><path d="M12 3 20 6v6c0 4.4-3.2 7.6-8 9-4.8-1.4-8-4.6-8-9V6l8-3Z" /><path d="m9 12 2.2 2.2L15.5 10" /></>,
  lock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" /><path d="M12 14.2v2.6" /></>,
  unlock: <><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 0 1 7.6-1.7" /><path d="M12 14.2v2.6" /></>,
  eye: <><path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M4 4.5 20 20" /><path d="M9.5 6.5A9.6 9.6 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3.3 3.8" /><path d="M6.3 8.2A17 17 0 0 0 2.5 12S6 18 12 18a9.4 9.4 0 0 0 3.6-.7" /><path d="M10 10.2a3 3 0 0 0 4 4" /></>,
  bell: <><path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z" /><path d="M10 18.5a2.2 2.2 0 0 0 4 0" /></>,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="8" r="1" fill="currentColor" /></>,
  warning: <><path d="M12 3.8 21.5 20H2.5L12 3.8Z" /><path d="M12 10v4.5" /><circle cx="12" cy="17.2" r="1" fill="currentColor" /></>,
  checkCircle: <><circle cx="12" cy="12" r="8.5" /><path d="m8 12.2 2.6 2.6L16 9.4" /></>,
  ban: <><circle cx="12" cy="12" r="8.5" /><path d="m6 6 12 12" /></>,
  hourglass: <><path d="M7 3.5h10M7 20.5h10" /><path d="M7.5 3.5c0 4 4.5 5 4.5 8.5s-4.5 4.5-4.5 8.5M16.5 3.5c0 4-4.5 5-4.5 8.5s4.5 4.5 4.5 8.5" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.2l3.2 2" /></>,
  send: <><path d="M20.5 3.5 3.8 10.2l6.4 2.6 2.6 6.4L20.5 3.5Z" /><path d="m10.2 12.8 4-4" /></>,
  download: <><path d="M12 4v10" /><path d="m8 10.5 4 4 4-4" /><path d="M4.5 18.5h15" /></>,
  upload: <><path d="M12 15V5" /><path d="m8 8.5 4-4 4 4" /><path d="M4.5 18.5h15" /></>,
  file: <><path d="M6 3.5h7l5 5v12H6v-17Z" /><path d="M13 3.5v5h5" /></>,
  fileCsv: <><path d="M6 3.5h7l5 5v12H6v-17Z" /><path d="M13 3.5v5h5" /><path d="M8.5 12.5h7M8.5 15.5h7M8.5 18.5h4" /></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="2.5" /><circle cx="8.5" cy="10" r="1.6" /><path d="m4.5 17 4.8-4.8L14 17l2.5-2.5 3 3" /></>,
  history: <><path d="M3.5 12A8.5 8.5 0 1 0 6 6.2" /><path d="M3.5 4.5V9H8" /><path d="M12 7.5V12l3.2 2" /></>,
  trash: <><path d="M4.5 6.5h15" /><path d="M9 6.5V4.8A1.3 1.3 0 0 1 10.3 3.5h3.4A1.3 1.3 0 0 1 15 4.8v1.7" /><path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" /><path d="M10.5 10v7M13.5 10v7" /></>,
  pencil: <><path d="M4.5 19.5h4L20 8a2.1 2.1 0 0 0-3-3L5.5 16.5l-1 3Z" /><path d="m15 6 3 3" /></>,
  copy: <><rect x="8.5" y="8.5" width="12" height="12" rx="2.5" /><path d="M15.5 5.5v-.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h.5" /></>,
  logout: <><path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14" /><path d="M17 8.5 20.5 12 17 15.5" /><path d="M20.5 12H9.5" /></>,
  login: <><path d="M10 4.5h7.5a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H10" /><path d="M7 8.5 3.5 12 7 15.5" /><path d="M3.5 12h14" /></>,
  door: <><path d="M5 20.5V4.8a1.3 1.3 0 0 1 1.6-1.3l9 1.7a1.3 1.3 0 0 1 1 1.3v14" /><path d="M3.5 20.5h17" /><circle cx="13.7" cy="12.7" r="1" fill="currentColor" /></>,
  globe: <><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17" /><path d="M12 3.5c2.2 2.4 3.3 5.4 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.4-3.3-8.5S9.8 5.9 12 3.5Z" /></>,
  language: <><path d="M3.5 6h9" /><path d="M8 4v2c0 4-2 7.5-4.5 9" /><path d="M6 10.5c1.2 2.3 3 4 5 5" /><path d="m13 20 4-10 4 10" /><path d="M14.2 17h5.6" /></>,
  coinsAlt: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v10" /></>,
  palette: <><path d="M12 3.5a8.5 8.5 0 0 0 0 17c1.3 0 2-.9 2-1.9 0-.5-.2-.9-.5-1.2-.3-.4-.5-.8-.5-1.2 0-1 .9-1.9 2-1.9h1.4a4.6 4.6 0 0 0 4.6-4.6c0-3.5-4-6.2-9-6.2Z" /><circle cx="7.8" cy="11.5" r="1.1" fill="currentColor" /><circle cx="10.5" cy="7.5" r="1.1" fill="currentColor" /><circle cx="15" cy="8" r="1.1" fill="currentColor" /></>,
  fontSize: <><path d="M3.5 19 8.5 6l5 13" /><path d="M5.2 15h6.6" /><path d="M14 19l3-8 3 8" /><path d="M15.2 16.5h3.6" /></>,

  /* --- brand / theme --- */
  sun: <><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M21.5 12h-2.2M4.7 12H2.5M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6M18.7 18.7l-1.6-1.6M6.9 6.9 5.3 5.3" /></>,
  moon: <><path d="M20.5 14.5A8.6 8.6 0 0 1 9.5 3.6a8.6 8.6 0 1 0 11 10.9Z" /></>,
  bolt: <><path d="M13.5 2.5 5 13.5h5l-1.5 8L18 10.5h-5.5l1-8Z" /></>,
  noBank: <><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M12 3.5v18" /><circle cx="12" cy="12" r="3.5" /></>,
  student: <><path d="M12 4 22 9l-10 5L2 9l10-5Z" /><path d="M6 11.2V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.8" /></>,
  megaphone: <><path d="M4 9.5v4a1.5 1.5 0 0 0 1.5 1.5H7l8 4.5V5.5L7 10H5.5A1.5 1.5 0 0 0 4 11.5Z" /><path d="M18 9.5a3.5 3.5 0 0 1 0 5" /><path d="M7 15v4.5h3" /></>,
  clipboard: <><rect x="5" y="5" width="14" height="16" rx="2.5" /><path d="M9 5V3.8A1.3 1.3 0 0 1 10.3 2.5h3.4A1.3 1.3 0 0 1 15 3.8V5" /><path d="M8.5 11h7M8.5 15h4.5" /></>,
  receipt: <><path d="M6 3.5h12v17l-2.4-1.6-2.4 1.6-2.4-1.6L8.4 20.5 6 18.9V3.5Z" /><path d="M9 8h6M9 12h6" /></>,
  key: <><circle cx="8" cy="12" r="4" /><path d="M12 12h9" /><path d="M17.5 12v3.5M20.5 12v2.5" /></>,
  note: <><path d="M5 4.5h14v10l-5 5H5v-15Z" /><path d="M19 14.5h-5v5" /><path d="M8.5 9h7M8.5 12.5h4" /></>,
  inbox: <><path d="M3.5 13.5 6 5h12l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 19v-5.5Z" /><path d="M3.5 13.5H9a3 3 0 0 0 6 0h5.5" /></>,
  rocket: <><path d="M12 3c3.2 2 4.8 5.2 4.8 9L14.5 15h-5L6.2 12c0-3.8 1.6-7 4.8-9Z" /><circle cx="12" cy="10" r="1.8" /><path d="M9.5 15 8 20l3-1.5M14.5 15 16 20l-3-1.5" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" /><path d="M7 6H4.5v1.5A3 3 0 0 0 7 10.4M17 6h2.5v1.5a3 3 0 0 1-2.5 2.9" /><path d="M12 14v3.5M8.5 20.5h7l-.7-3h-5.6l-.7 3Z" /></>,
  wave: <><path d="M3 12.5c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" /><path d="M3 17c1.5-2 3-2 4.5 0s3 2 4.5 0 3-2 4.5 0 3 2 4.5 0" opacity=".55" /></>,
  hand: <><path d="M8.5 11V5.5a1.6 1.6 0 0 1 3.2 0V11" /><path d="M11.7 10.5V4.2a1.6 1.6 0 0 1 3.2 0v6.3" /><path d="M14.9 11V6.4a1.6 1.6 0 0 1 3.2 0V14a7 7 0 0 1-7 7h-.4a6 6 0 0 1-4.4-1.9L3.5 16a1.6 1.6 0 0 1 2.4-2.1L8.5 16" /></>,
  percent: <><path d="M6 18 18 6" /><circle cx="7.5" cy="7.5" r="2.5" /><circle cx="16.5" cy="16.5" r="2.5" /></>,
  layers: <><path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" /><path d="m3 12.5 9 4.5 9-4.5" /><path d="m3 17 9 4.5 9-4.5" /></>,
  sparkle: <><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18.2l-1.8-5.6L4.5 10.8 10.2 9 12 3.5Z" /></>,
  question: <><circle cx="12" cy="12" r="8.5" /><path d="M9.8 9.5a2.3 2.3 0 0 1 4.4.8c0 1.5-2.2 1.9-2.2 3.2" /><circle cx="12" cy="16.8" r="1" fill="currentColor" /></>,
  help: <><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.6c0 1.7-2.4 2-2.4 3.4" /><circle cx="12" cy="16.8" r="1" fill="currentColor" /></>,
};

export const ICON_NAMES = Object.keys(ICONS);

export default function Icon({ name, size, className = '', strokeWidth, title, ...rest }) {
  const glyph = ICONS[name] || ICONS.info;

  return (
    <svg
      className={`cc-icon${className ? ` ${className}` : ''}`}
      data-icon={name}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth || 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {glyph}
    </svg>
  );
}
