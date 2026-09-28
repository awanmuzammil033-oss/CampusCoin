import React from 'react';
import * as FcIcons from 'react-icons/fc';
import { HiBell, HiMicrophone, HiEye, HiPencilSquare, HiInformationCircle, HiGift, HiCreditCard, HiShieldCheck } from 'react-icons/hi2';
import { MdQrCodeScanner } from 'react-icons/md';

/**
 * Icon — renders accurate, vibrant SVG icons across the app.
 */
const ICON_MAP = {
  /* navigation / chrome */
  home: FcIcons.FcHome, house: FcIcons.FcHome, receipt: FcIcons.FcDebt, repeat: FcIcons.FcSynchronize, calendar: FcIcons.FcCalendar,
  tag: FcIcons.FcGrid, target: FcIcons.FcBullish, chart: FcIcons.FcBarChart, chartUp: FcIcons.FcPositiveDynamic,
  sun: FcIcons.FcIdea, moon: FcIcons.FcNightLandscape, bulb: FcIcons.FcIdea, bookmark: FcIcons.FcBookmark, pin: FcIcons.FcBookmark,
  insightWeather: FcIcons.FcLightAtTheEndOfTunnel,
  settings: FcIcons.FcSettings, user: FcIcons.FcBusinessman, users: FcIcons.FcConferenceCall, grid: FcIcons.FcGrid, list: FcIcons.FcList,
  plus: FcIcons.FcPlus, minus: FcIcons.FcMinus, check: FcIcons.FcCheckmark, close: FcIcons.FcCancel,
  chevronDown: FcIcons.FcDown, chevronRight: FcIcons.FcRight,
  arrowRight: FcIcons.FcRight, arrowLeft: FcIcons.FcLeft, arrowUp: FcIcons.FcUp, arrowDown: FcIcons.FcDown,
  play: FcIcons.FcStart, search: FcIcons.FcSearch, filter: FcIcons.FcFilledFilter, menu: FcIcons.FcMenu, dots: FcIcons.FcMenu, more: FcIcons.FcMenu,

  /* money & tools */
  wallet: FcIcons.FcPaid, coin: FcIcons.FcCurrencyExchange, coins: FcIcons.FcDonate, coinsAlt: FcIcons.FcDonate,
  card: (props) => <HiCreditCard style={{ color: '#10b981', ...props.style }} {...props} />,
  cash: FcIcons.FcMoneyTransfer, bank: FcIcons.FcSafe, piggy: FcIcons.FcDonate,
  trendUp: FcIcons.FcPositiveDynamic, trendDown: FcIcons.FcNegativeDynamic, trendFlat: FcIcons.FcNeutralTrading, scale: FcIcons.FcRules, percent: FcIcons.FcSalesPerformance,
  exchange: FcIcons.FcCurrencyExchange, swap: FcIcons.FcSynchronize, undo: FcIcons.FcUndo,
  vault: FcIcons.FcSafe,

  /* categories (student life) */
  categories: FcIcons.FcGrid,
  cup: FcIcons.FcIcons8Cup, bus: FcIcons.FcAutomotive, book: FcIcons.FcReading, books: FcIcons.FcReadingEbook,
  gift: (props) => <HiGift style={{ color: '#ec4899', ...props.style }} {...props} />,
  film: FcIcons.FcFilm, gamepad: FcIcons.FcSportsMode, award: FcIcons.FcDiploma1, briefcase: FcIcons.FcBriefcase, plusCircle: FcIcons.FcPlus,
  shirt: FcIcons.FcCloth, health: FcIcons.FcLike, phone: FcIcons.FcCellPhone, laptop: FcIcons.FcDisplay,
  burger: FcIcons.FcShop, pizza: FcIcons.FcShop,

  /* status / feedback & actions */
  shield: (props) => <HiShieldCheck style={{ color: '#059669', ...props.style }} {...props} />,
  lock: FcIcons.FcLock, unlock: FcIcons.FcUnlock, eyeOff: FcIcons.FcPrivacy,
  warning: FcIcons.FcDisclaimer, checkCircle: FcIcons.FcApproval, ban: FcIcons.FcCancel,
  hourglass: FcIcons.FcClock, clock: FcIcons.FcClock, send: FcIcons.FcRight, download: FcIcons.FcDownload, upload: FcIcons.FcUpload,
  file: FcIcons.FcFile, fileCsv: FcIcons.FcDataSheet, image: FcIcons.FcPicture, history: FcIcons.FcTimeline,
  trash: FcIcons.FcFullTrash, copy: FcIcons.FcMindMap,
  logout: FcIcons.FcLeave, login: FcIcons.FcKey, door: FcIcons.FcLeave,
  globe: FcIcons.FcGlobe, language: FcIcons.FcGlobe, palette: FcIcons.FcEditImage, fontSize: FcIcons.FcAlphabeticalSortingAz,
  cloud: FcIcons.FcLightAtTheEndOfTunnel, storm: FcIcons.FcDislike, partly: FcIcons.FcIdea, cart: FcIcons.FcShop, jar: FcIcons.FcDonate, flag: FcIcons.FcBullish,

  /* brand / misc */
  bolt: FcIcons.FcElectricity, noBank: FcIcons.FcSafe, student: FcIcons.FcGraduationCap, megaphone: FcIcons.FcSpeaker,
  clipboard: FcIcons.FcTodoList, key: FcIcons.FcKey, note: FcIcons.FcDocument, inbox: FcIcons.FcOpenedFolder, rocket: FcIcons.FcEnteringHeavenAlive,
  trophy: FcIcons.FcDiploma2, wave: FcIcons.FcStatistics, hand: FcIcons.FcCollaboration, layers: FcIcons.FcStackOfPhotos,
  sparkle: FcIcons.FcIdea, sparkles: FcIcons.FcIdea, question: FcIcons.FcQuestions, help: FcIcons.FcQuestions,
  stop: FcIcons.FcCancel, record: FcIcons.FcVideoCall,

  /* specialized custom vector icons */
  scan: (props) => <MdQrCodeScanner style={{ color: '#14b8a6', ...props.style }} {...props} />,
  bell: (props) => <HiBell style={{ color: '#f59e0b', ...props.style }} {...props} />,
  mic: (props) => <HiMicrophone style={{ color: '#2563eb', ...props.style }} {...props} />,
  micLive: (props) => <HiMicrophone style={{ color: '#ef4444', ...props.style }} {...props} />,
  eye: (props) => <HiEye style={{ color: '#0284c7', ...props.style }} {...props} />,
  pencil: (props) => <HiPencilSquare style={{ color: '#059669', ...props.style }} {...props} />,
  info: (props) => <HiInformationCircle style={{ color: '#3b82f6', ...props.style }} {...props} />,
};

export const ICON_NAMES = Object.keys(ICON_MAP);

export default function Icon({ name, size, className = '', glyph, title, style, ...rest }) {
  if (glyph) {
    return (
      <span
        className={`cc-emoji${className ? ` ${className}` : ''}`}
        style={size ? { fontSize: `${size}px`, ...style } : style}
        role={title ? 'img' : undefined}
        aria-label={title || undefined}
        aria-hidden={title ? undefined : 'true'}
        {...rest}
      >
        {glyph}
      </span>
    );
  }

  const IconComponent = ICON_MAP[name] || ICON_MAP.info;
  const iconSize = size ? `${size}px` : '1.2em';

  return (
    <span
      className={`cc-fc-icon${className ? ` ${className}` : ''}`}
      data-icon={name}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        verticalAlign: 'middle',
        fontSize: size ? `${size}px` : undefined,
        ...style,
      }}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : 'true'}
      {...rest}
    >
      <IconComponent size={iconSize} />
    </span>
  );
}


