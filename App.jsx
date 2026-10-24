import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts';
import { Plus, ArrowLeft, AlertTriangle, TrendingUp, Copy, Check, Trash2, ChevronRight, UploadCloud, X, Loader2, FileText, PenLine } from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Storage-Bridge: außerhalb von Claude-Artifacts (window.storage      */
/* existiert dann nicht) automatisch auf sessionStorage zurückfallen.   */
/* Dieser Block ist bewusst der einzige Ort, den ein GitHub-Export     */
/* eventuell anpassen muss (z. B. um stattdessen einen eigenen Server  */
/* mit echten Nutzerkonten anzusprechen statt sessionStorage).         */
/* ------------------------------------------------------------------ */
// Detected BEFORE the storage polyfill below runs, so it reflects reality:
// true only when Claude's artifact environment already provided window.storage.
const RUNNING_IN_CLAUDE = typeof window !== 'undefined' && !!window.storage;

// Inside Claude artifacts, calling api.anthropic.com directly works (the
// sandbox proxies it, no key needed client-side). On a standalone/exported
// website this call would fail (CORS + no credentials), so it goes through
// a same-origin backend route instead — see /api/claude.js for the proxy
// that keeps the real API key server-side.
const CLAUDE_API_ENDPOINT = RUNNING_IN_CLAUDE
  ? 'https://api.anthropic.com/v1/messages'
  : '/api/claude';

if (typeof window !== 'undefined' && !window.storage) {
  // Per-visitor data: sessionStorage lives only in this browser tab and is
  // cleared when the tab closes, so the next person always starts empty.
  // Earlier versions used localStorage (incl. plain-text demo passwords);
  // those keys are wiped here once.
  const LS_PREFIX = 'projekt-budget-tool:';
  try {
    Object.keys(window.localStorage).filter((k) => k.startsWith(LS_PREFIX)).forEach((k) => window.localStorage.removeItem(k));
  } catch { /* storage unavailable */ }
  const store = window.sessionStorage;
  window.storage = {
    async get(key) {
      const raw = store.getItem(LS_PREFIX + key);
      if (raw === null) throw new Error(`Key not found: ${key}`);
      return { key, value: raw };
    },
    async set(key, value) {
      store.setItem(LS_PREFIX + key, value);
      return { key, value };
    },
    async delete(key) {
      store.removeItem(LS_PREFIX + key);
      return { key, deleted: true };
    },
    async list(prefix) {
      const keys = Object.keys(store)
        .filter((k) => k.startsWith(LS_PREFIX))
        .map((k) => k.slice(LS_PREFIX.length))
        .filter((k) => !prefix || k.startsWith(prefix));
      return { keys };
    },
  };
}

/* ------------------------------------------------------------------ */
/* Konstanten & Helfer                                                 */
/* ------------------------------------------------------------------ */

const DAY = 24 * 60 * 60 * 1000;
const LOCALE_MAP = { de: 'de-DE', en: 'en-US', ar: 'ar-EG' };
// Set once per App render (see App()). Avoids threading `lang` through every
// helper/formatter function signature and call site across the whole file.
let CURRENT_LANG = 'de';

const DEFAULT_AREA_NAMES_BY_LANG = {
  de: ['Personal', 'Material', 'Extern', 'Sonstiges'],
  en: ['Personnel', 'Materials', 'External', 'Other'],
  ar: ['العاملون', 'المواد', 'خارجي', 'أخرى'],
};
const defaultAreas = () => DEFAULT_AREA_NAMES_BY_LANG[CURRENT_LANG].map((name) => ({ id: uid(), name, budget: 0 }));

const T = {
  de: {
    appEyebrow: 'Projekt-Budget-Tool', portfolioTitle: 'Portfolio-Übersicht',
    totalBudget: 'Gesamtbudget', totalSpent: 'Verbraucht',
    emptyTitle: 'Noch keine Projekte',
    emptySub: 'Lege eine Kostenübersicht an — manuell mit eigenen Bereichen oder per PDF-Upload, bei dem die Positionen automatisch erkannt werden.',
    addCostOverview: 'Kostenübersicht hinzufügen',
    colProject: 'Projekt', colStatus: 'Status', colBudget: 'Budget', colSpent: 'Verbraucht', colRemaining: 'Rest', colHistory: 'Verlauf',
    statusGreen: 'Im Plan', statusYellow: 'Beobachten', statusRed: 'Kritisch',
    backToPortfolio: 'Portfolio', printPdf: 'Als PDF speichern',
    budgetLabel: 'Budget', spentLabel: 'Verbraucht', remainingLabel: 'Rest', timeProgressLabel: 'Zeitfortschritt',
    ofBudget: (pct) => `${pct}% des Budgets`,
    costAreasTitle: 'Kostenstellen', noAreasDefined: 'Keine Bereiche definiert.',
    bookingsTitle: 'Buchungen', colDate: 'Datum', colArea: 'Bereich', colNote: 'Notiz', colAmount: 'Betrag',
    noBookingsYet: 'Noch keine Buchungen erfasst.',
    amountPlaceholder: 'Betrag (€)', notePlaceholder: 'Notiz', bookBtn: 'Buchen',
    summaryTitle: 'Management Summary', copyBtn: 'Kopieren', copiedBtn: 'Kopiert',
    deleteProjectBtn: 'Projekt löschen', deleteProjectConfirm: (name) => `"${name}" wirklich löschen?`,
    deleteAccountTitle: 'Konto löschen', deleteAccountConfirm: (name) => `Konto "${name}" und alle zugehörigen Projekte wirklich löschen? Das kann nicht rückgängig gemacht werden.`,
    areasAndBudget: 'Bereiche & Budgetverteilung',
    overBy: (amt) => `Überzogen um ${amt}`, unallocated: (amt) => `Nicht zugewiesen: ${amt}`,
    areaNamePlaceholder: 'Bereich, z. B. Personal', areaBudgetPlaceholder: 'Budget (€)',
    removeAreaTitle: 'Bereich entfernen', addAreaBtn: 'Bereich hinzufügen',
    modalTitle: 'Kostenübersicht hinzufügen',
    targetPrompt: 'Für welches Projekt?', targetNewOption: 'Neues Projekt anlegen',
    targetExistingOption: (name) => `Zu „${name}" hinzufügen`,
    cancelBtn: 'Abbrechen', continueBtn: 'Weiter', backBtn: 'Zurück',
    setupModePrompt: 'Wie möchtest du die Projekt-Eckdaten (Budget & Bereiche) angeben?',
    modeManualTitle: 'Eingabe', modeManualSub: 'Name, Budget und Bereiche selbst eintragen',
    modePdfTitle: 'PDF hochladen', modePdfSubSetup: 'Budgetplan oder Projektcharta — Eckdaten werden automatisch erkannt',
    setupPdfDropTitle: 'PDF mit Budgetplan auswählen', setupPdfDropSub: 'z. B. Projektcharta oder Budgetkalkulation',
    analyzingText: 'PDF wird analysiert …',
    setupFormPrompt: 'Eckdaten prüfen und bei Bedarf anpassen.',
    projectNameLabel: 'Projektname', budgetTotalLabel: 'Budget gesamt (€)', startLabel: 'Start', endLabel: 'Ende',
    continueToUpload: 'Weiter',
    costPromptText: 'Kostenübersicht als PDF hinzufügen? (Kontoauszug, Rechnungen, Ausgabenliste)',
    costPdfSub: 'Positionen werden automatisch erkannt und den Bereichen zugeordnet',
    costSkipTitle: 'Ohne Kostenübersicht anlegen', costSkipSub: 'Projekt jetzt anlegen, Buchungen später manuell ergänzen',
    costUploadDropTitle: 'PDF mit Kostenübersicht auswählen', costUploadDropSub: 'Rechnungen, Kontoauszüge oder Ausgabenlisten',
    retryBtn: 'Erneut versuchen',
    reviewFound: (n) => `${n} Position${n === 1 ? '' : 'en'} erkannt — bitte prüfen, bevor du übernimmst.`,
    reviewNoItems: 'Keine Positionen erkannt.', reviewSumSelected: 'Summe ausgewählt:',
    submitBtn: 'Übernehmen',
    fileTooLarge: (mb) => `Die Datei ist recht groß (${mb} MB) — das kann die Analyse verlangsamen oder fehlschlagen lassen. Ein schärferer Scan mit kleinerer Dateigröße hilft oft.`,
    warnBudgetOver: () => 'Budget überschritten.',
    warnBudgetHigh: () => 'Budget zu über 80% verplant.',
    warnPace: (b, t) => `Kosten laufen schneller als der Zeitplan: ${b}% des Budgets verbraucht, aber erst ${t}% der Laufzeit vergangen.`,
    warnArea: (name, spent, budget) => `Bereich „${name}" überschreitet sein Budget: ${spent} von ${budget}.`,
    forecastExhausted: () => 'Budget ist bereits ausgeschöpft.',
    forecastNoBookings: () => 'Noch keine Buchungen — keine Prognose möglich.',
    forecastBeforeEnd: (d, end) => `Bei aktuellem Tempo reicht das Budget bis ${d} — vor Projektende (${end}).`,
    forecastAfterEnd: (d) => `Bei aktuellem Tempo reicht das Budget über das Projektende hinaus (bis ${d}).`,
    summaryHeader: (name, today) => `${name} — Management Summary (${today})`,
    summaryBudgetLine: (budget, spent, pct, rest) => `Budget: ${budget} | Verbraucht: ${spent} (${pct}%) | Rest: ${rest}`,
    summaryTimeLine: (start, end, pct) => `Laufzeit: ${start} – ${end} | Zeitfortschritt: ${pct}%`,
    summaryStatusLine: (label) => `Status: ${label}`,
    summaryWarningsLine: (text) => `Warnungen: ${text}`,
    summaryNoIssues: 'Keine Auffälligkeiten.',
    summaryForecastLine: (text) => `Prognose: ${text}`,
    burndownTitle: 'Budget-Burndown',
    createBtn: 'Anlegen', defaultWorkspaceName: 'Mein Konto',
    pdfPopupBlocked: 'Der Browser hat das Öffnen des Druckfensters blockiert. Bitte Pop-ups für diese Seite erlauben und erneut versuchen.',
    addMoreOverview: 'Weitere Kostenübersicht (PDF) hinzufügen',
    aiForecastBtn: 'Handlungsempfehlung mit Prognose', aiForecastTitle: 'Handlungsempfehlung mit Prognose',
    aiForecastLoading: 'Analysiere Ausgabenverlauf …',
    aiForecastEmptyHint: 'Noch keine Analyse erstellt. Auf "Handlungsempfehlung mit Prognose" klicken, um den Ausgabenverlauf auszuwerten.',
    compareWithoutTips: 'Ohne Anpassung', compareWithTips: 'Mit Tipps umgesetzt',
    aiForecastSectionForecast: 'Wohin entwickelt sich das Projekt?',
    aiForecastSectionTips: 'Handlungsempfehlungen, um kein Budget zu verlieren',
    aiForecastSectionOutlook: 'Prognose nach Umsetzung der Tipps',
    closeBtn: 'Schließen',
    demoBtn: 'Mit Demo-Daten testen – ohne Login', demoHint: 'Lädt 2 fiktive Beispielprojekte. Kein Konto nötig.',
    localNote: 'Ihre Daten bleiben nur in diesem Browser-Tab und werden beim Schließen automatisch gelöscht; jede Person startet leer. Nur für PDF-Erkennung und KI-Prognose wird der Inhalt an die Anthropic-API gesendet.',
    deleteAllData: 'Alle Daten löschen', confirmDeleteAll: 'Alle Projekte und Einstellungen in diesem Browser löschen?',
    imprint: 'Impressum', privacy: 'Datenschutz', allTools: 'Zurück zur Startseite',
  },
  en: {
    appEyebrow: 'Project Budget Tool', portfolioTitle: 'Portfolio Overview',
    totalBudget: 'Total Budget', totalSpent: 'Spent',
    emptyTitle: 'No projects yet',
    emptySub: 'Add a cost overview — enter it manually with your own cost areas, or upload a PDF and let items get detected automatically.',
    addCostOverview: 'Add cost overview',
    colProject: 'Project', colStatus: 'Status', colBudget: 'Budget', colSpent: 'Spent', colRemaining: 'Remaining', colHistory: 'Trend',
    statusGreen: 'On track', statusYellow: 'Watch', statusRed: 'Critical',
    backToPortfolio: 'Portfolio', printPdf: 'Save as PDF',
    budgetLabel: 'Budget', spentLabel: 'Spent', remainingLabel: 'Remaining', timeProgressLabel: 'Time elapsed',
    ofBudget: (pct) => `${pct}% of budget`,
    costAreasTitle: 'Cost areas', noAreasDefined: 'No areas defined.',
    bookingsTitle: 'Entries', colDate: 'Date', colArea: 'Area', colNote: 'Note', colAmount: 'Amount',
    noBookingsYet: 'No entries recorded yet.',
    amountPlaceholder: 'Amount (€)', notePlaceholder: 'Note', bookBtn: 'Add entry',
    summaryTitle: 'Management summary', copyBtn: 'Copy', copiedBtn: 'Copied',
    deleteProjectBtn: 'Delete project', deleteProjectConfirm: (name) => `Really delete "${name}"?`,
    deleteAccountTitle: 'Delete account', deleteAccountConfirm: (name) => `Really delete account "${name}" and all its projects? This cannot be undone.`,
    areasAndBudget: 'Areas & budget allocation',
    overBy: (amt) => `Over by ${amt}`, unallocated: (amt) => `Unallocated: ${amt}`,
    areaNamePlaceholder: 'Area, e.g. Personnel', areaBudgetPlaceholder: 'Budget (€)',
    removeAreaTitle: 'Remove area', addAreaBtn: 'Add area',
    modalTitle: 'Add cost overview',
    targetPrompt: 'Which project is this for?', targetNewOption: 'Create new project',
    targetExistingOption: (name) => `Add to "${name}"`,
    cancelBtn: 'Cancel', continueBtn: 'Continue', backBtn: 'Back',
    setupModePrompt: 'How would you like to provide the project details (budget & areas)?',
    modeManualTitle: 'Enter manually', modeManualSub: 'Set name, budget and areas yourself',
    modePdfTitle: 'Upload PDF', modePdfSubSetup: 'Budget plan or project charter — details are detected automatically',
    setupPdfDropTitle: 'Choose PDF with budget plan', setupPdfDropSub: 'e.g. project charter or budget calculation',
    analyzingText: 'Analyzing PDF …',
    setupFormPrompt: 'Review the details and adjust if needed.',
    projectNameLabel: 'Project name', budgetTotalLabel: 'Total budget (€)', startLabel: 'Start', endLabel: 'End',
    continueToUpload: 'Continue',
    costPromptText: 'Add a cost overview as PDF? (bank statement, invoices, expense list)',
    costPdfSub: 'Items are detected automatically and assigned to areas',
    costSkipTitle: 'Create without cost overview', costSkipSub: 'Create the project now, add entries manually later',
    costUploadDropTitle: 'Choose PDF with cost overview', costUploadDropSub: 'Invoices, bank statements or expense lists',
    retryBtn: 'Try again',
    reviewFound: (n) => `${n} item${n === 1 ? '' : 's'} detected — please review before importing.`,
    reviewNoItems: 'No items detected.', reviewSumSelected: 'Selected total:',
    submitBtn: 'Import',
    fileTooLarge: (mb) => `This file is fairly large (${mb} MB) — that can slow down or break the analysis. A sharper scan at a smaller file size often helps.`,
    warnBudgetOver: () => 'Budget exceeded.',
    warnBudgetHigh: () => 'Over 80% of budget committed.',
    warnPace: (b, t) => `Spending is outpacing the schedule: ${b}% of budget spent, but only ${t}% of the timeline elapsed.`,
    warnArea: (name, spent, budget) => `Area "${name}" is over its budget: ${spent} of ${budget}.`,
    forecastExhausted: () => 'Budget is already exhausted.',
    forecastNoBookings: () => 'No entries yet — forecast not possible.',
    forecastBeforeEnd: (d, end) => `At the current rate, the budget lasts until ${d} — before the project ends (${end}).`,
    forecastAfterEnd: (d) => `At the current rate, the budget lasts beyond the project end (until ${d}).`,
    summaryHeader: (name, today) => `${name} — Management Summary (${today})`,
    summaryBudgetLine: (budget, spent, pct, rest) => `Budget: ${budget} | Spent: ${spent} (${pct}%) | Remaining: ${rest}`,
    summaryTimeLine: (start, end, pct) => `Timeline: ${start} – ${end} | Time elapsed: ${pct}%`,
    summaryStatusLine: (label) => `Status: ${label}`,
    summaryWarningsLine: (text) => `Warnings: ${text}`,
    summaryNoIssues: 'No issues found.',
    summaryForecastLine: (text) => `Forecast: ${text}`,
    burndownTitle: 'Budget Burndown',
    createBtn: 'Create', defaultWorkspaceName: 'My account',
    pdfPopupBlocked: 'The browser blocked the print window. Please allow pop-ups for this page and try again.',
    addMoreOverview: 'Add another cost overview (PDF)',
    aiForecastBtn: 'Recommendations with forecast', aiForecastTitle: 'Recommendations with forecast',
    aiForecastLoading: 'Analyzing spending history …',
    aiForecastEmptyHint: 'No analysis yet. Click "Recommendations with forecast" to evaluate the spending history.',
    compareWithoutTips: 'Without changes', compareWithTips: 'With tips applied',
    aiForecastSectionForecast: 'Where is this project heading?',
    aiForecastSectionTips: 'Recommendations to avoid losing budget',
    aiForecastSectionOutlook: 'Outlook if you follow these tips',
    closeBtn: 'Close',
    demoBtn: 'Try with demo data – no login', demoHint: 'Loads 2 fictional sample projects. No account needed.',
    localNote: 'Your data stays in this browser tab only and is deleted when you close it; everyone starts empty. Content is sent to the Anthropic API only for PDF detection and the AI forecast.',
    deleteAllData: 'Delete all data', confirmDeleteAll: 'Delete all projects and settings in this browser?',
    imprint: 'Imprint', privacy: 'Privacy', allTools: 'Back to home',
  },
  ar: {
    appEyebrow: 'أداة ميزانية المشروع', portfolioTitle: 'نظرة عامة على المحفظة',
    totalBudget: 'الميزانية الإجمالية', totalSpent: 'المُنفَق',
    emptyTitle: 'لا توجد مشاريع بعد',
    emptySub: 'أضف بيانات التكاليف — أدخلها يدويًا مع تحديد المجالات الخاصة بك، أو ارفع ملف PDF ليتم التعرّف على البنود تلقائيًا.',
    addCostOverview: 'إضافة بيانات التكاليف',
    colProject: 'المشروع', colStatus: 'الحالة', colBudget: 'الميزانية', colSpent: 'المُنفَق', colRemaining: 'المتبقي', colHistory: 'الاتجاه',
    statusGreen: 'على المسار', statusYellow: 'مراقبة', statusRed: 'حرج',
    backToPortfolio: 'المحفظة', printPdf: 'حفظ كملف PDF',
    budgetLabel: 'الميزانية', spentLabel: 'المُنفَق', remainingLabel: 'المتبقي', timeProgressLabel: 'التقدم الزمني',
    ofBudget: (pct) => `${pct}% من الميزانية`,
    costAreasTitle: 'مراكز التكلفة', noAreasDefined: 'لم يتم تحديد أي مجالات.',
    bookingsTitle: 'القيود', colDate: 'التاريخ', colArea: 'المجال', colNote: 'ملاحظة', colAmount: 'المبلغ',
    noBookingsYet: 'لا توجد قيود مسجّلة بعد.',
    amountPlaceholder: 'المبلغ (€)', notePlaceholder: 'ملاحظة', bookBtn: 'إضافة قيد',
    summaryTitle: 'ملخص الإدارة', copyBtn: 'نسخ', copiedBtn: 'تم النسخ',
    deleteProjectBtn: 'حذف المشروع', deleteProjectConfirm: (name) => `هل تريد حقًا حذف "${name}"؟`,
    deleteAccountTitle: 'حذف الحساب', deleteAccountConfirm: (name) => `هل تريد حقًا حذف الحساب "${name}" وجميع مشاريعه؟ لا يمكن التراجع عن هذا.`,
    areasAndBudget: 'المجالات وتوزيع الميزانية',
    overBy: (amt) => `تجاوز بمقدار ${amt}`, unallocated: (amt) => `غير مخصّص: ${amt}`,
    areaNamePlaceholder: 'المجال، مثال: العاملون', areaBudgetPlaceholder: 'الميزانية (€)',
    removeAreaTitle: 'إزالة المجال', addAreaBtn: 'إضافة مجال',
    modalTitle: 'إضافة بيانات التكاليف',
    targetPrompt: 'لأي مشروع؟', targetNewOption: 'إنشاء مشروع جديد',
    targetExistingOption: (name) => `إضافة إلى "${name}"`,
    cancelBtn: 'إلغاء', continueBtn: 'متابعة', backBtn: 'رجوع',
    setupModePrompt: 'كيف تريد إدخال بيانات المشروع الأساسية (الميزانية والمجالات)؟',
    modeManualTitle: 'إدخال يدوي', modeManualSub: 'أدخل الاسم والميزانية والمجالات بنفسك',
    modePdfTitle: 'رفع ملف PDF', modePdfSubSetup: 'خطة ميزانية أو ميثاق مشروع — يتم التعرّف على البيانات تلقائيًا',
    setupPdfDropTitle: 'اختر ملف PDF لخطة الميزانية', setupPdfDropSub: 'مثال: ميثاق مشروع أو حساب ميزانية',
    analyzingText: 'جارٍ تحليل ملف PDF …',
    setupFormPrompt: 'راجع البيانات الأساسية وعدّلها عند الحاجة.',
    projectNameLabel: 'اسم المشروع', budgetTotalLabel: 'الميزانية الإجمالية (€)', startLabel: 'البداية', endLabel: 'النهاية',
    continueToUpload: 'متابعة',
    costPromptText: 'هل تريد إضافة بيانات التكاليف كملف PDF؟ (كشف حساب بنكي، فواتير، قائمة مصروفات)',
    costPdfSub: 'يتم التعرّف على البنود تلقائيًا وتخصيصها للمجالات',
    costSkipTitle: 'إنشاء بدون بيانات تكاليف', costSkipSub: 'أنشئ المشروع الآن وأضف القيود يدويًا لاحقًا',
    costUploadDropTitle: 'اختر ملف PDF لبيانات التكاليف', costUploadDropSub: 'فواتير أو كشوف حساب بنكية أو قوائم مصروفات',
    retryBtn: 'إعادة المحاولة',
    reviewFound: (n) => `تم التعرّف على ${n} بند — يُرجى المراجعة قبل الاعتماد.`,
    reviewNoItems: 'لم يتم التعرّف على أي بنود.', reviewSumSelected: 'المجموع المحدد:',
    submitBtn: 'اعتماد',
    fileTooLarge: (mb) => `الملف كبير نسبيًا (${mb} ميغابايت) — قد يؤدي ذلك إلى إبطاء التحليل أو فشله. غالبًا ما يساعد مسح أوضح بحجم ملف أصغر.`,
    warnBudgetOver: () => 'تم تجاوز الميزانية.',
    warnBudgetHigh: () => 'تم التخطيط لأكثر من 80% من الميزانية.',
    warnPace: (b, t) => `الإنفاق يسير أسرع من الجدول الزمني: تم إنفاق ${b}% من الميزانية، بينما مضى ${t}% فقط من المدة الزمنية.`,
    warnArea: (name, spent, budget) => `المجال "${name}" تجاوز ميزانيته: ${spent} من ${budget}.`,
    forecastExhausted: () => 'الميزانية مستنفدة بالفعل.',
    forecastNoBookings: () => 'لا توجد قيود بعد — لا يمكن وضع توقّع.',
    forecastBeforeEnd: (d, end) => `بالمعدل الحالي، تكفي الميزانية حتى ${d} — قبل نهاية المشروع (${end}).`,
    forecastAfterEnd: (d) => `بالمعدل الحالي، تكفي الميزانية حتى ما بعد نهاية المشروع (حتى ${d}).`,
    summaryHeader: (name, today) => `${name} — ملخص الإدارة (${today})`,
    summaryBudgetLine: (budget, spent, pct, rest) => `الميزانية: ${budget} | المُنفَق: ${spent} (${pct}%) | المتبقي: ${rest}`,
    summaryTimeLine: (start, end, pct) => `المدة: ${start} – ${end} | التقدم الزمني: ${pct}%`,
    summaryStatusLine: (label) => `الحالة: ${label}`,
    summaryWarningsLine: (text) => `تحذيرات: ${text}`,
    summaryNoIssues: 'لا توجد ملاحظات.',
    summaryForecastLine: (text) => `التوقّع: ${text}`,
    burndownTitle: 'مسار الميزانية',
    createBtn: 'إنشاء', defaultWorkspaceName: 'حسابي',
    pdfPopupBlocked: 'قام المتصفح بحظر نافذة الطباعة. يُرجى السماح بالنوافذ المنبثقة لهذه الصفحة والمحاولة مرة أخرى.',
    addMoreOverview: 'إضافة بيانات تكاليف أخرى (PDF)',
    aiForecastBtn: 'توصيات مع توقّع', aiForecastTitle: 'توصيات مع توقّع',
    aiForecastLoading: 'جارٍ تحليل سجل الإنفاق …',
    aiForecastEmptyHint: 'لم يتم إجراء أي تحليل بعد. اضغط على "توصيات مع توقّع" لتحليل سجل الإنفاق.',
    compareWithoutTips: 'بدون تغيير', compareWithTips: 'مع تطبيق النصائح',
    aiForecastSectionForecast: 'إلى أين يتجه هذا المشروع؟',
    aiForecastSectionTips: 'توصيات لتجنّب خسارة الميزانية',
    aiForecastSectionOutlook: 'التوقّع بعد تطبيق هذه النصائح',
    closeBtn: 'إغلاق',
    demoBtn: 'جرّب ببيانات تجريبية – بدون تسجيل دخول', demoHint: 'يحمّل مشروعين تجريبيين خياليين. لا حاجة لحساب.',
    localNote: 'تبقى بياناتك في علامة التبويب هذه فقط وتُحذف عند إغلاقها، ويبدأ كل شخص بصفحة فارغة. يُرسل المحتوى إلى واجهة Anthropic فقط لتحليل ملفات PDF والتوقع بالذكاء الاصطناعي.',
    deleteAllData: 'حذف جميع البيانات', confirmDeleteAll: 'حذف جميع المشاريع والإعدادات في هذا المتصفح؟',
    imprint: 'بيانات الناشر', privacy: 'الخصوصية', allTools: 'العودة إلى الصفحة الرئيسية',
  },
};

function t(key, ...args) {
  const entry = (T[CURRENT_LANG] && T[CURRENT_LANG][key] !== undefined) ? T[CURRENT_LANG][key] : T.de[key];
  return typeof entry === 'function' ? entry(...args) : entry;
}

const fmtEUR = (n) =>
  (n || 0).toLocaleString(LOCALE_MAP[CURRENT_LANG], { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const fmtEURPrecise = (n) =>
  (n || 0).toLocaleString(LOCALE_MAP[CURRENT_LANG], { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString(LOCALE_MAP[CURRENT_LANG], { day: '2-digit', month: 'short', year: 'numeric' });
const fmtDateShort = (d) => new Date(d).toLocaleDateString(LOCALE_MAP[CURRENT_LANG], { day: '2-digit', month: '2-digit' });
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const uid = () => Math.random().toString(36).slice(2, 10);
const todayISO = () => new Date().toISOString().slice(0, 10);

// Robust: input[type=date] requires exact YYYY-MM-DD. AI-extracted dates can arrive
// in other formats (e.g. "01.02.2026") which JS Date can sometimes still parse,
// but assigning that raw string to a date input throws "string did not match pattern".
// This normalizes any recognizable format to strict ISO, or returns null.
// Robust: input[type=number] can also reject/misbehave on non-plain-numeric strings
// (e.g. German "85.000,00" or a currency symbol). Normalize to a plain numeric string.
function toPlainNumber(val) {
  if (typeof val === 'number' && !isNaN(val)) return String(val);
  if (typeof val !== 'string') return '';
  let s = val.trim().replace(/[€$£\s]/g, '');
  if (!s) return '';
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.'); // German: 85.000,50 -> 85000.50
  } else {
    s = s.replace(/,/g, ''); // English thousands sep: 85,000.50 -> 85000.50
  }
  const n = parseFloat(s);
  return isNaN(n) ? '' : String(n);
}

function toISODate(str) {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s; // already ISO
  let m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{4})$/); // DD.MM.YYYY or DD/MM/YYYY
  if (m) {
    const [, d, mo, y] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  m = s.match(/^(\d{4})[.\/](\d{1,2})[.\/](\d{1,2})$/); // YYYY/MM/DD
  if (m) {
    const [, y, mo, d] = m;
    return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  const parsed = new Date(s);
  if (!isNaN(parsed)) return parsed.toISOString().slice(0, 10);
  return null;
}
const TODAY = new Date();

function normalizeAreaName(s) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

const MAX_RECOMMENDED_FILE_MB = 8;

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error(CURRENT_LANG === 'en' ? 'Could not read the file.' : CURRENT_LANG === 'ar' ? 'تعذّرت قراءة الملف.' : 'Datei konnte nicht gelesen werden.'));
    reader.readAsDataURL(file);
  });
}

function tagStage(stage, err) {
  const name = err?.name || 'Error';
  const msg = err?.message || String(err);
  const tagged = new Error(`[${stage}] ${msg}`);
  tagged.name = name;
  return tagged;
}

// Robust against a real, observed failure mode of the upstream response:
// occasionally the body arrives with the first few characters missing
// (e.g. "message" truncated to "sage"), which breaks a plain JSON.parse
// even though the actual payload we need ("content": [...]) is intact
// further into the string. Try the normal parse first; if that fails,
// locate the content array directly via bracket matching and parse just
// that slice instead of giving up.
function extractContentArray(rawBody) {
  try {
    const data = JSON.parse(rawBody);
    if (data && Array.isArray(data.content)) return data.content;
  } catch { /* fall through to repair attempt */ }

  const idx = rawBody.indexOf('"content"');
  if (idx === -1) return null;
  const bracketStart = rawBody.indexOf('[', idx);
  if (bracketStart === -1) return null;
  let depth = 0;
  for (let i = bracketStart; i < rawBody.length; i++) {
    if (rawBody[i] === '[') depth++;
    else if (rawBody[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(rawBody.slice(bracketStart, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

// If the model's JSON output gets cut off mid-generation (hits the response
// length budget — happens on documents with many line items), a plain
// JSON.parse fails entirely even though most items before the cut-off point
// are complete and usable. This salvages every complete top-level array
// element up to the truncation point instead of discarding everything.
function salvagePartialJSON(text) {
  const arrMatch = text.match(/"(\w+)"\s*:\s*\[/);
  if (!arrMatch) return null;
  const key = arrMatch[1];
  const bracketStart = text.indexOf('[', arrMatch.index);
  const elements = [];
  let i = bracketStart + 1;
  while (i < text.length) {
    while (i < text.length && /[\s,]/.test(text[i])) i++;
    if (i >= text.length || text[i] === ']') break;
    const startChar = text[i];
    if (startChar !== '{' && startChar !== '[') break; // unsupported element shape, stop salvaging
    const closeChar = startChar === '{' ? '}' : ']';
    let depth = 0, j = i;
    for (; j < text.length; j++) {
      if (text[j] === startChar) depth++;
      else if (text[j] === closeChar) { depth -= 1; if (depth === 0) break; }
    }
    if (depth !== 0) break; // this element itself got cut off — stop here
    try {
      elements.push(JSON.parse(text.slice(i, j + 1)));
    } catch {
      break;
    }
    i = j + 1;
  }
  if (elements.length === 0) return null;
  const result = {};
  result[key] = elements;
  return result;
}

// Anthropic/Claude.ai sometimes reports usage-limit errors as a raw
// JSON-encoded string inside error.message (rate/session limits, org-level
// restrictions) instead of a short human sentence. Detect that shape and
// show something readable instead of dumping the raw blob to the user.
function formatApiErrorDetail(detail) {
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail);
    const looksLikeLimitError = parsed && (parsed.type === 'exceeded_limit' || parsed.disabled_reason || parsed.notice);
    if (looksLikeLimitError) {
      const resetsAt = parsed.resetsAt || parsed.resets_at;
      const resetDate = resetsAt ? new Date((typeof resetsAt === 'number' ? resetsAt * 1000 : resetsAt)) : null;
      const resetText = resetDate && !isNaN(resetDate.getTime())
        ? ` (${resetDate.toLocaleString(LOCALE_MAP[CURRENT_LANG])})`
        : '';
      if (CURRENT_LANG === 'en') return `Usage limit reached${resetText}. Please wait for it to reset, or upgrade your plan.`;
      if (CURRENT_LANG === 'ar') return `تم بلوغ حد الاستخدام${resetText}. يُرجى الانتظار حتى إعادة الضبط أو ترقية خطتك.`;
      return `Nutzungslimit erreicht${resetText}. Bitte warte, bis es zurückgesetzt wird, oder upgrade deinen Plan.`;
    }
  } catch { /* not JSON — already a short human message, use as-is */ }
  return detail;
}

async function callClaudeVisionJSON(base64, prompt, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let response;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      try {
        response = await fetch(CLAUDE_API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'claude-sonnet-5-5',
            max_tokens: 1000,
            messages: [
              {
                role: 'user',
                content: [
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
                  { type: 'text', text: prompt },
                ],
              },
            ],
          }),
        });
      } catch (err) {
        throw tagStage(err.name === 'AbortError' ? 'Zeitüberschreitung' : 'Netzwerk-Anfrage', err);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        let detail = '';
        try {
          const errBody = await response.json();
          detail = formatApiErrorDetail(errBody?.error?.message || '');
        } catch { /* ignore parse failure, fall back to status code */ }
        throw new Error(detail ? `[API] Analyse fehlgeschlagen: ${detail}` : `[API] Analyse fehlgeschlagen (Status ${response.status}).`);
      }

      let rawBody;
      try {
        rawBody = await response.text();
      } catch (err) { throw tagStage('Antwort lesen', err); }

      if (!rawBody || !rawBody.trim()) {
        throw new Error('[Antwort leer] Die Antwort kam ohne Inhalt zurück (Netzwerk-Aussetzer).');
      }

      const contentArray = extractContentArray(rawBody);
      if (!contentArray) {
        const preview = rawBody.slice(0, 160).replace(/\s+/g, ' ');
        throw new Error(`[Antwort parsen] Konnte Inhalt nicht extrahieren — Inhalt: "${preview}"`);
      }

      const textBlock = contentArray.find((b) => b.type === 'text');
      if (!textBlock) throw new Error('[Antwort lesen] Keine Textantwort erhalten.');

      const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (err) {
        const salvaged = salvagePartialJSON(cleaned);
        if (salvaged) return salvaged;
        const preview = cleaned.slice(0, 160).replace(/\s+/g, ' ');
        throw new Error(`[Daten verarbeiten] ${err.name || 'Error'}: ${err.message} — Inhalt: "${preview}"`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
    }
  }
  const retryNote = retries > 0 ? ` (nach ${retries + 1} Versuchen)` : '';
  lastErr.message = `${lastErr.message}${retryNote}`;
  throw lastErr;
}

async function extractBookingsFromPdf(file, areas) {
  let base64;
  try {
    base64 = await fileToBase64(file);
  } catch (err) { throw tagStage('Datei lesen', err); }

  const areaList = areas.map((a, i) => `${i}: ${a.name}`).join('\n');

  const prompt = `Du bekommst eine Kostenübersicht, Rechnung, einen Kontoauszug oder eine Ausgabenliste als PDF. Extrahiere ALLE einzelnen Kostenpositionen — auch wenn es viele sind (ggf. 20+).

Bereiche (Index: Name):
${areaList}

Antworte AUSSCHLIESSLICH mit einem KOMPAKTEN JSON-Objekt, ohne Erklärung, ohne Markdown-Codeblock, exakt in diesem Format (kurze Feldnamen, um im begrenzten Antwortbudget möglichst viele Positionen unterzubringen):
{
  "p": string oder null (vorgeschlagener Projektname),
  "i": [
    ["YYYY-MM-DD" oder null, Bereichs-Index als Zahl, Betrag als Zahl, "sehr kurze Notiz, max. 4 Wörter"]
  ]
}

Regeln:
- Betrag ist eine positive Zahl in Euro, ohne Währungssymbol, ohne Tausenderpunkte.
- Bereichs-Index bezieht sich auf die nummerierte Liste oben (0-basiert). Wähle den am besten passenden Bereich.
- Notiz: SEHR kurz halten (max. 4 Wörter) — bei vielen Positionen ist knapper Platz wichtiger als Vollständigkeit der Notiz.
- Wenn kein Datum erkennbar ist, benutze null.
- Erfasse lieber alle Positionen mit kurzen Notizen, als wenige mit langen.
- Wenn du keine einzelnen Positionen erkennst, gib ein leeres i-Array zurück.`;

  const parsed = await callClaudeVisionJSON(base64, prompt);

  let cleanItems;
  try {
    const rawItems = Array.isArray(parsed.i) ? parsed.i : (Array.isArray(parsed.items) ? parsed.items : []);
    cleanItems = rawItems.map((it) => {
      // Support both the compact tuple format [date, areaIndex, amount, note]
      // and, defensively, the older verbose object format.
      let date, areaRef, amount, note;
      if (Array.isArray(it)) {
        [date, areaRef, amount, note] = it;
      } else {
        date = it.date; areaRef = it.category; amount = it.amount; note = it.note;
      }
      const area = typeof areaRef === 'number'
        ? (areas[areaRef] || areas[0])
        : (areas.find((a) => normalizeAreaName(a.name) === normalizeAreaName(areaRef)) || areas[0]);
      return {
        id: uid(),
        date: toISODate(date) || todayISO(),
        areaId: area.id,
        amount: Number(toPlainNumber(amount)) || 0,
        note: (note || '').toString().slice(0, 80),
        include: true,
      };
    }).filter((it) => it.amount > 0);
  } catch (err) {
    throw tagStage('Daten verarbeiten', err);
  }

  return { suggestedProjectName: parsed.p || parsed.suggestedProjectName || null, items: cleanItems };
}

async function extractSetupFromPdf(file) {
  let base64;
  try {
    base64 = await fileToBase64(file);
  } catch (err) { throw tagStage('Datei lesen', err); }

  const prompt = `Du bekommst ein Dokument mit einer Projekt-Budgetplanung (z. B. Projektcharta, Budgetplan, Kalkulation). Extrahiere die Projekt-Eckdaten.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt, ohne Erklärung, ohne Markdown-Codeblock, exakt in diesem Format:
{
  "name": string oder null,
  "budget": Zahl oder null,
  "start": "YYYY-MM-DD" oder null,
  "end": "YYYY-MM-DD" oder null,
  "areas": [ { "name": string, "budget": Zahl } ]
}

Regeln:
- budget ist eine positive Zahl in Euro, ohne Währungssymbol, ohne Tausenderpunkte.
- areas enthält die Aufteilung des Budgets auf Bereiche/Kostenstellen, falls im Dokument erkennbar. Wenn keine Aufteilung erkennbar ist, gib ein leeres Array zurück.
- Wenn ein Datum nicht erkennbar ist, benutze null.`;

  const parsed = await callClaudeVisionJSON(base64, prompt);

  try {
    const areas = Array.isArray(parsed.areas) && parsed.areas.length > 0
      ? parsed.areas.map((a) => ({ id: uid(), name: (a.name || '').toString().slice(0, 40), budget: Number(toPlainNumber(a.budget)) || 0 }))
      : defaultAreas();

    return {
      name: (parsed.name || '').toString(),
      budget: toPlainNumber(parsed.budget),
      start: toISODate(parsed.start) || todayISO(),
      end: toISODate(parsed.end) || '',
      areas,
    };
  } catch (err) {
    throw tagStage('Daten verarbeiten', err);
  }
}

async function callClaudeTextJSON(prompt, { retries = 4 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let response;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 25000);
      try {
        response = await fetch(CLAUDE_API_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model: 'claude-sonnet-5-5',
            max_tokens: 1000,
            messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
          }),
        });
      } catch (err) {
        throw tagStage(err.name === 'AbortError' ? 'Zeitüberschreitung' : 'Netzwerk-Anfrage', err);
      } finally {
        clearTimeout(timeoutId);
      }

      if (!response.ok) {
        let detail = '';
        try {
          const errBody = await response.json();
          detail = formatApiErrorDetail(errBody?.error?.message || '');
        } catch { /* ignore parse failure, fall back to status code */ }
        throw new Error(detail ? `[API] ${detail}` : `[API] Status ${response.status}.`);
      }

      let rawBody;
      try {
        rawBody = await response.text();
      } catch (err) { throw tagStage('Antwort lesen', err); }
      if (!rawBody || !rawBody.trim()) throw new Error('[Antwort leer] Die Antwort kam ohne Inhalt zurück.');

      const contentArray = extractContentArray(rawBody);
      if (!contentArray) {
        const preview = rawBody.slice(0, 160).replace(/\s+/g, ' ');
        throw new Error(`[Antwort parsen] Konnte Inhalt nicht extrahieren — Inhalt: "${preview}"`);
      }

      const textBlock = contentArray.find((b) => b.type === 'text');
      if (!textBlock) throw new Error('[Antwort lesen] Keine Textantwort erhalten.');
      const cleaned = textBlock.text.replace(/```json|```/g, '').trim();
      try {
        return JSON.parse(cleaned);
      } catch (err) {
        throw new Error(`[Daten verarbeiten] ${err.name}: ${err.message}`);
      }
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
        continue;
      }
    }
  }
  const retryNote = retries > 0 ? ` (nach ${retries + 1} Versuchen)` : '';
  lastErr.message = `${lastErr.message}${retryNote}`;
  throw lastErr;
}

async function generateForecastAndTips(project) {
  const spent = getSpent(project);
  const breakdown = getAreaBreakdown(project);
  const status = getStatus(project);
  const bookingsList = [...project.bookings]
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((b) => `${b.date} | ${getAreaName(project, b.areaId)} | ${fmtEURPrecise(b.amount)} | ${b.note || ''}`)
    .join('\n');
  const areasList = breakdown.map((a) => `${a.name}: ${fmtEUR(a.spent)} verbraucht von ${a.budget > 0 ? fmtEUR(a.budget) : 'kein Budget gesetzt'}`).join('\n');

  const langName = CURRENT_LANG === 'en' ? 'English' : CURRENT_LANG === 'ar' ? 'Arabic' : 'German';

  const prompt = `Du bist ein erfahrener Projekt-Controller. Analysiere folgendes Projektbudget und gib eine vorausschauende Einschätzung.

Projekt: ${project.name}
Budget gesamt: ${fmtEUR(project.budget)}
Bereits verbraucht: ${fmtEUR(spent)} (${Math.round(status.budgetPct * 100)}%)
Zeitfortschritt: ${Math.round(status.timePct * 100)}%
Laufzeit: ${project.start} bis ${project.end}

Bereiche:
${areasList || '(keine Bereiche definiert)'}

Buchungsverlauf (Datum | Bereich | Betrag | Notiz):
${bookingsList || '(noch keine Buchungen)'}

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in dieser Sprache: ${langName}, ohne Markdown-Codeblock, exakt in diesem Format:
{
  "riskLevel": "green" | "yellow" | "red",
  "forecast": "2-4 Sätze: realistische Einschätzung, wohin sich das Projekt entwickelt, basierend auf dem bisherigen Ausgabenmuster (nicht nur linear, sondern unter Berücksichtigung von Trends/Häufungen in den Buchungen).",
  "projectedFinalPct": Zahl (geschätzter Prozentsatz des Budgets, der bei unverändertem Tempo bis Projektende verbraucht sein wird, z.B. 115 für 15% Überschreitung),
  "tips": ["3 bis 5 konkrete, umsetzbare Tipps, um eine Budgetüberschreitung zu vermeiden, jeweils ein kurzer Satz"],
  "outlook": "2-3 Sätze: wie sich die Prognose voraussichtlich verbessert, wenn die Tipps umgesetzt werden.",
  "projectedFinalPctWithTips": Zahl (geschätzter Prozentsatz des Budgets bei Umsetzung der Tipps)
}

riskLevel: "green" wenn das Projekt voraussichtlich im Budget bleibt, "yellow" bei absehbarer knapper Überschreitung oder unklarem Trend, "red" bei deutlicher absehbarer Überschreitung.

Stil-Vorgaben, damit es wie eine echte Notiz eines erfahrenen Projekt-Controllers klingt, nicht wie eine typische KI-Antwort:
- Keine Einleitungsfloskeln ("Es lässt sich feststellen, dass...", "Wichtig zu beachten ist...", "Zusammenfassend..."). Direkt mit dem Befund einsteigen.
- Keine Absicherungssprache ("könnte möglicherweise", "es ist denkbar, dass"). Klare Aussagen mit konkreten Zahlen aus den Daten.
- Jeder Tipp beginnt mit einem anderen, konkreten Verb (nicht wiederholt "Sollte..." oder "Es wird empfohlen..."). Kein Tipp fasst nur Allgemeinplätze zusammen — jeder muss sich auf eine echte Zahl oder einen Bereich aus den Daten oben beziehen.
- Keine abschließende Plattitüde ("Eine regelmäßige Überprüfung wird empfohlen."). Der letzte Satz soll inhaltlich etwas aussagen, nicht nur pflichtschuldig abrunden.`;

  const parsed = await callClaudeTextJSON(prompt);
  const clampPct = (n) => Math.max(0, Math.min(200, Number(n) || 0));
  return {
    riskLevel: ['green', 'yellow', 'red'].includes(parsed.riskLevel) ? parsed.riskLevel : 'yellow',
    forecast: (parsed.forecast || '').toString(),
    projectedFinalPct: clampPct(parsed.projectedFinalPct),
    tips: Array.isArray(parsed.tips) ? parsed.tips.map((x) => x.toString()) : [],
    outlook: (parsed.outlook || '').toString(),
    projectedFinalPctWithTips: clampPct(parsed.projectedFinalPctWithTips),
  };
}

function daysBetween(a, b) {
  return (new Date(b) - new Date(a)) / DAY;
}

/* ------------------------------------------------------------------ */
/* Berechnungen                                                        */
/* ------------------------------------------------------------------ */

function getSpent(project) {
  return project.bookings.reduce((sum, b) => sum + Number(b.amount || 0), 0);
}

function getAreaBreakdown(project) {
  return (project.areas || []).map((a) => ({
    id: a.id,
    name: a.name,
    budget: Number(a.budget || 0),
    spent: project.bookings.filter((b) => b.areaId === a.id).reduce((s, b) => s + Number(b.amount || 0), 0),
  }));
}

function getAreaWarnings(project) {
  return getAreaBreakdown(project)
    .filter((a) => a.budget > 0 && a.spent > a.budget)
    .map((a) => t('warnArea', a.name, fmtEUR(a.spent), fmtEUR(a.budget)));
}

function getAreaName(project, areaId) {
  return (project.areas || []).find((a) => a.id === areaId)?.name || '—';
}

function getTimeProgress(project) {
  const total = daysBetween(project.start, project.end);
  if (total <= 0) return 1;
  return clamp01(daysBetween(project.start, TODAY.toISOString()) / total);
}

function getBudgetProgress(project) {
  if (!project.budget) return 0;
  return getSpent(project) / project.budget;
}

function getStatus(project) {
  const budgetPct = getBudgetProgress(project);
  const timePct = getTimeProgress(project);
  const drift = budgetPct - timePct;

  let budgetLevel = 'green';
  if (budgetPct >= 1) budgetLevel = 'red';
  else if (budgetPct >= 0.8) budgetLevel = 'yellow';

  let paceLevel = 'green';
  if (drift > 0.2) paceLevel = 'red';
  else if (drift > 0.1) paceLevel = 'yellow';

  const order = { green: 0, yellow: 1, red: 2 };
  const level = order[budgetLevel] >= order[paceLevel] ? budgetLevel : paceLevel;

  const warnings = [];
  if (budgetPct >= 1) warnings.push(t('warnBudgetOver'));
  else if (budgetPct >= 0.8) warnings.push(t('warnBudgetHigh'));
  if (drift > 0.1) {
    warnings.push(t('warnPace', Math.round(budgetPct * 100), Math.round(timePct * 100)));
  }
  return { level, warnings, budgetPct, timePct, drift };
}

function getForecast(project) {
  const spent = getSpent(project);
  const elapsedDays = Math.max(1, daysBetween(project.start, TODAY.toISOString()));
  const dailyRate = spent / elapsedDays;
  const remaining = project.budget - spent;

  if (spent >= project.budget) {
    return { text: t('forecastExhausted'), date: null };
  }
  if (dailyRate <= 0) {
    return { text: t('forecastNoBookings'), date: null };
  }
  // Cap daysLeft to avoid overflowing JS's Date range when dailyRate is tiny
  // relative to remaining budget (e.g. very early in a project with only a
  // small booking so far) — without this, `new Date(...)` can silently
  // become "Invalid Date" and break the forecast text.
  const daysLeft = Math.min(remaining / dailyRate, 36500);
  const depletion = new Date(TODAY.getTime() + daysLeft * DAY);
  const end = new Date(project.end);
  const beforeEnd = depletion < end;
  return {
    text: beforeEnd
      ? t('forecastBeforeEnd', fmtDate(depletion), fmtDate(project.end))
      : t('forecastAfterEnd', fmtDate(depletion)),
    date: depletion,
    beforeEnd,
  };
}

function buildBurndownSeries(project, projectedFinalPct) {
  const start = new Date(project.start);
  const end = new Date(project.end);
  const today = TODAY;
  const dates = new Set([+start, +end, +today]);
  project.bookings.forEach((b) => dates.add(+new Date(b.date)));

  const sorted = [...dates].sort((a, b) => a - b).map((t) => new Date(t));
  const sortedBookings = [...project.bookings].sort((a, b) => new Date(a.date) - new Date(b.date));

  let running = 0;
  let bIdx = 0;
  const totalDays = (end - start) / DAY || 1;

  const result = sorted.map((d) => {
    while (bIdx < sortedBookings.length && new Date(sortedBookings[bIdx].date) <= d) {
      running += Number(sortedBookings[bIdx].amount || 0);
      bIdx += 1;
    }
    const elapsed = clamp01((d - start) / DAY / totalDays);
    return {
      date: +d,
      label: fmtDateShort(d),
      geplant: Math.round(project.budget * elapsed),
      ist: d <= today ? Math.round(running) : null,
    };
  });

  if (projectedFinalPct != null) {
    // Anchor to the actual "ist" value at today's point — not getSpent(project),
    // which would include bookings dated after today and cause a visible jump
    // where the projection line doesn't connect to where the actual-spend line stops.
    const todayPoint = result.find((p) => p.date === +today);
    const spentSoFar = todayPoint ? todayPoint.ist : getSpent(project);
    const todayElapsedFrac = clamp01((today - start) / DAY / totalDays);
    const remainingFrac = 1 - todayElapsedFrac;
    const projectedEndValue = project.budget * (projectedFinalPct / 100);
    result.forEach((point) => {
      if (point.date >= +today) {
        const pointElapsedFrac = clamp01((point.date - start) / DAY / totalDays);
        const progress = remainingFrac > 0 ? clamp01((pointElapsedFrac - todayElapsedFrac) / remainingFrac) : 1;
        point.prognose = Math.round(spentSoFar + (projectedEndValue - spentSoFar) * progress);
      }
    });
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Kleine UI-Bausteine                                                 */
/* ------------------------------------------------------------------ */

const LEVEL_COLOR = { green: '#4F9E86', yellow: '#D9A441', red: '#E2574C' };
const LEVEL_LABEL_KEY = { green: 'statusGreen', yellow: 'statusYellow', red: 'statusRed' };

function StatusPill({ level }) {
  return (
    <span className="status-pill" style={{ background: `${LEVEL_COLOR[level]}1A`, color: LEVEL_COLOR[level], borderColor: `${LEVEL_COLOR[level]}55` }}>
      <span className="status-dot" style={{ background: LEVEL_COLOR[level] }} />
      {t(LEVEL_LABEL_KEY[level])}
    </span>
  );
}

function Sparkline({ series, budget, width = 120, height = 34 }) {
  const ist = series.filter((p) => p.ist !== null);
  if (ist.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(budget, ...ist.map((p) => p.ist)) || 1;
  const minDate = series[0].date;
  const maxDate = series[series.length - 1].date;
  const spanDate = maxDate - minDate || 1;

  const pts = ist.map((p) => {
    const x = ((p.date - minDate) / spanDate) * width;
    const y = height - (p.ist / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');

  const budgetY = height - (budget / max) * height;

  return (
    <svg width={width} height={height}>
      <line x1="0" y1={budgetY} x2={width} y2={budgetY} stroke="#5A6890" strokeDasharray="2,2" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="#C9A227" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts.split(' ').slice(-1)[0].split(',')[0]} cy={pts.split(' ').slice(-1)[0].split(',')[1]} r="2.5" fill="#C9A227" />
    </svg>
  );
}

function AreaEditor({ areas, setAreas, totalBudget }) {
  const allocated = areas.reduce((s, a) => s + Number(a.budget || 0), 0);
  const remaining = Number(totalBudget || 0) - allocated;

  function update(id, patch) { setAreas(areas.map((a) => (a.id === id ? { ...a, ...patch } : a))); }
  function addArea() { setAreas([...areas, { id: uid(), name: '', budget: 0 }]); }
  function removeArea(id) { setAreas(areas.filter((a) => a.id !== id)); }

  return (
    <div className="area-editor">
      <div className="area-editor-head">
        <span className="target-label">{t('areasAndBudget')}</span>
        <span className={`area-remaining${remaining < 0 ? ' over' : ''}`}>
          {remaining < 0 ? t('overBy', fmtEUR(Math.abs(remaining))) : t('unallocated', fmtEUR(remaining))}
        </span>
      </div>
      {areas.map((a) => (
        <div className="area-row" key={a.id}>
          <input type="text" placeholder={t('areaNamePlaceholder')} value={a.name} onChange={(e) => update(a.id, { name: e.target.value })} />
          <input type="number" min="0" placeholder={t('areaBudgetPlaceholder')} value={a.budget} onChange={(e) => update(a.id, { budget: e.target.value })} />
          <button type="button" className="icon-btn" onClick={() => removeArea(a.id)} title={t('removeAreaTitle')}>
            <Trash2 size={13} />
          </button>
        </div>
      ))}
      <button type="button" className="area-add-btn" onClick={addArea}><Plus size={13} /> {t('addAreaBtn')}</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PDF-Import                                                           */
/* ------------------------------------------------------------------ */

function ImportPdfPanel({ projects, onImport, onClose, fixedTarget }) {
  const [step, setStep] = useState(fixedTarget ? 'costUpload' : (projects.length > 0 ? 'target' : 'setupMode'));
  const [errorMsg, setErrorMsg] = useState('');
  const [errorReturn, setErrorReturn] = useState('setupPdfUpload');
  const [items, setItems] = useState([]);
  const [target, setTarget] = useState(fixedTarget || 'NEW');
  const [newMeta, setNewMeta] = useState({ name: '', budget: '', start: todayISO(), end: '' });
  const [areas, setAreas] = useState(defaultAreas());
  const [sizeWarning, setSizeWarning] = useState('');

  const existingProject = target !== 'NEW' ? projects.find((p) => p.id === target) : null;
  const areasForExtraction = target === 'NEW' ? areas : (existingProject?.areas || []);

  const areasValid = areas.length > 0 && areas.every((a) => a.name.trim());
  const setupValid = newMeta.name && newMeta.budget && newMeta.end && areasValid;

  function chooseTarget() {
    setStep(target === 'NEW' ? 'setupMode' : 'costUpload');
  }

  function chooseSetupMode(m) {
    setStep(m === 'manual' ? 'setupForm' : 'setupPdfUpload');
  }

  function checkFileSize(file) {
    const mb = file.size / (1024 * 1024);
    setSizeWarning(mb > MAX_RECOMMENDED_FILE_MB ? t('fileTooLarge', mb.toFixed(1)) : '');
  }

  async function handleSetupFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    checkFileSize(file);
    setStep('setupAnalyzing');
    try {
      const result = await extractSetupFromPdf(file);
      setNewMeta({ name: result.name, budget: result.budget, start: result.start, end: result.end });
      setAreas(result.areas);
      setStep('setupForm');
    } catch (err) {
      const label = err?.name && err.name !== 'Error' ? `${err.name}: ` : '';
      setErrorMsg(label + (err?.message || t('reviewNoItems')));
      setErrorReturn('setupPdfUpload');
      setStep('error');
    }
  }

  function submitSetup(e) {
    e.preventDefault();
    if (!setupValid) return;
    setStep('costUpload');
  }

  function finalizeProject(bookings) {
    const project = {
      id: uid(),
      name: newMeta.name,
      budget: Number(newMeta.budget),
      start: newMeta.start,
      end: newMeta.end,
      areas: areas.map((a) => ({ id: a.id, name: a.name.trim(), budget: Number(a.budget || 0) })),
      bookings,
    };
    onImport(project, 'NEW');
    onClose();
  }

  async function handleCostFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    checkFileSize(file);
    setStep('costAnalyzing');
    try {
      const result = await extractBookingsFromPdf(file, areasForExtraction);
      setItems(result.items);
      setStep('costReview');
    } catch (err) {
      const label = err?.name && err.name !== 'Error' ? `${err.name}: ` : '';
      setErrorMsg(label + (err?.message || t('reviewNoItems')));
      setErrorReturn('costUpload');
      setStep('error');
    }
  }

  function updateItem(id, patch) {
    setItems(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const includedItems = items.filter((it) => it.include);
  const total = includedItems.reduce((s, it) => s + it.amount, 0);

  function confirmCostOverview() {
    const bookings = includedItems.map(({ id, date, areaId, amount, note }) => ({
      id: uid(), date, areaId, amount, note,
    }));
    if (target === 'NEW') {
      finalizeProject(bookings);
    } else {
      onImport(bookings, target);
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{t('modalTitle')}</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        {step === 'target' && (
          <div>
            <p className="review-hint">{t('targetPrompt')}</p>
            <div className="target-block">
              <select value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="NEW">{t('targetNewOption')}</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{t('targetExistingOption', p.name)}</option>)}
              </select>
            </div>
            <div className="add-actions">
              <button className="btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
              <button className="btn-primary" onClick={chooseTarget}>{t('continueBtn')}</button>
            </div>
          </div>
        )}

        {step === 'setupMode' && (
          <div>
            <p className="review-hint">{t('setupModePrompt')}</p>
            <div className="mode-choice">
              <button className="mode-card" onClick={() => chooseSetupMode('manual')}>
                <PenLine size={20} />
                <span className="mode-card-title">{t('modeManualTitle')}</span>
                <span className="mode-card-sub">{t('modeManualSub')}</span>
              </button>
              <button className="mode-card" onClick={() => chooseSetupMode('pdf')}>
                <UploadCloud size={20} />
                <span className="mode-card-title">{t('modePdfTitle')}</span>
                <span className="mode-card-sub">{t('modePdfSubSetup')}</span>
              </button>
            </div>
            <div className="add-actions">
              <button className="btn-ghost" onClick={() => setStep(projects.length > 0 ? 'target' : 'setupMode')} disabled={projects.length === 0}>{t('backBtn')}</button>
              <div />
            </div>
          </div>
        )}

        {step === 'setupPdfUpload' && (
          <div>
            <label className="dropzone">
              <UploadCloud size={22} />
              <span>{t('setupPdfDropTitle')}</span>
              <span className="dropzone-sub">{t('setupPdfDropSub')}</span>
              <input type="file" accept="application/pdf" onChange={handleSetupFile} hidden />
            </label>
            <div className="add-actions">
              <button className="btn-ghost" onClick={() => setStep('setupMode')}>{t('backBtn')}</button>
            </div>
          </div>
        )}

        {step === 'setupAnalyzing' && (
          <div className="analyzing-block">
            <Loader2 className="spin" size={20} />
            <span>{t('analyzingText')}</span>
          </div>
        )}

        {step === 'setupForm' && (
          <form onSubmit={submitSetup}>
            <p className="review-hint">{t('setupFormPrompt')}</p>
            {sizeWarning && (
              <div className="warning-box" style={{ marginBottom: 14 }}>
                <AlertTriangle size={16} />
                <p style={{ margin: 0 }}>{sizeWarning}</p>
              </div>
            )}
            <div className="add-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <label>
                {t('projectNameLabel')}
                <input value={newMeta.name} onChange={(e) => setNewMeta({ ...newMeta, name: e.target.value })} required />
              </label>
              <label>
                {t('budgetTotalLabel')}
                <input type="number" min="0" value={newMeta.budget} onChange={(e) => setNewMeta({ ...newMeta, budget: e.target.value })} required />
              </label>
              <label>
                {t('startLabel')}
                <input type="date" value={newMeta.start} onChange={(e) => setNewMeta({ ...newMeta, start: e.target.value })} required />
              </label>
              <label>
                {t('endLabel')}
                <input type="date" value={newMeta.end} onChange={(e) => setNewMeta({ ...newMeta, end: e.target.value })} required />
              </label>
            </div>

            <AreaEditor areas={areas} setAreas={setAreas} totalBudget={newMeta.budget} />

            <div className="add-actions">
              <button type="button" className="btn-ghost" onClick={() => setStep('setupMode')}>{t('backBtn')}</button>
              <button type="submit" className="btn-primary" disabled={!setupValid}>{t('continueBtn')}</button>
            </div>
          </form>
        )}

        {step === 'costUpload' && (
          <div>
            <p className="review-hint">{t('costPromptText')}</p>
            <label className="dropzone">
              <UploadCloud size={22} />
              <span>{t('costUploadDropTitle')}</span>
              <span className="dropzone-sub">{t('costUploadDropSub')}</span>
              <input type="file" accept="application/pdf" onChange={handleCostFile} hidden />
            </label>
            <div className="add-actions">
              <button className="btn-ghost" onClick={() => fixedTarget ? onClose() : setStep(target === 'NEW' ? 'setupForm' : 'target')}>{t('backBtn')}</button>
            </div>
          </div>
        )}

        {step === 'costAnalyzing' && (
          <div className="analyzing-block">
            <Loader2 className="spin" size={20} />
            <span>{t('analyzingText')}</span>
          </div>
        )}

        {step === 'error' && (
          <div className="warning-box modal-warning">
            <AlertTriangle size={16} />
            <div>
              <p>{errorMsg}</p>
              <button className="btn-ghost small" style={{ marginTop: 8 }} onClick={() => setStep(errorReturn)}>{t('retryBtn')}</button>
            </div>
          </div>
        )}

        {step === 'costReview' && (
          <div>
            <p className="review-hint">
              <FileText size={13} /> {t('reviewFound', items.length)}
            </p>
            {sizeWarning && (
              <div className="warning-box" style={{ marginBottom: 14 }}>
                <AlertTriangle size={16} />
                <p style={{ margin: 0 }}>{sizeWarning}</p>
              </div>
            )}

            <div className="review-table-wrap">
              <table className="bookings-table">
                <thead>
                  <tr><th></th><th>{t('colDate')}</th><th>{t('colArea')}</th><th>{t('colNote')}</th><th className="num">{t('colAmount')}</th></tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} style={{ opacity: it.include ? 1 : 0.4 }}>
                      <td><input type="checkbox" checked={it.include} onChange={(e) => updateItem(it.id, { include: e.target.checked })} /></td>
                      <td><input type="date" value={it.date} onChange={(e) => updateItem(it.id, { date: e.target.value })} className="review-input" /></td>
                      <td>
                        <select value={it.areaId} onChange={(e) => updateItem(it.id, { areaId: e.target.value })} className="review-input">
                          {areasForExtraction.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                      </td>
                      <td><input type="text" value={it.note} onChange={(e) => updateItem(it.id, { note: e.target.value })} className="review-input" /></td>
                      <td><input type="number" value={it.amount} onChange={(e) => updateItem(it.id, { amount: Number(e.target.value) })} className="review-input num" /></td>
                    </tr>
                  ))}
                  {items.length === 0 && (
                    <tr><td colSpan={5} className="empty-row">{t('reviewNoItems')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="review-total">{t('reviewSumSelected')} <span className="mono">{fmtEUR(total)}</span></p>

            <div className="add-actions">
              <button className="btn-ghost" onClick={onClose}>{t('cancelBtn')}</button>
              <button className="btn-primary" disabled={includedItems.length === 0} onClick={confirmCostOverview}>{t('submitBtn')}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Portfolio-Ansicht                                                   */
/* ------------------------------------------------------------------ */

function LangSwitcher({ lang, setLang }) {
  const LANGS = [
    { code: 'de', label: 'DE' },
    { code: 'en', label: 'EN' },
    { code: 'ar', label: 'AR' },
  ];
  return (
    <div className="lang-switcher no-print">
      {LANGS.map((l) => (
        <button
          key={l.code}
          className={`lang-btn${lang === l.code ? ' active' : ''}`}
          onClick={() => setLang(l.code)}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function PortfolioView({ projects, onSelect, onAdd, onDelete, onImport, onLoadDemo, lang, setLang }) {
  const [showImport, setShowImport] = useState(false);

  const sorted = useMemo(() => {
    const order = { red: 0, yellow: 1, green: 2 };
    return [...projects].sort((a, b) => order[getStatus(a).level] - order[getStatus(b).level]);
  }, [projects]);

  const totals = useMemo(() => {
    const budget = projects.reduce((s, p) => s + Number(p.budget || 0), 0);
    const spent = projects.reduce((s, p) => s + getSpent(p), 0);
    return { budget, spent };
  }, [projects]);

  return (
    <div>
      <div className="top-bar no-print">
        <a className="all-tools-link" href={PORTFOLIO_URL}>← {t('allTools')}</a>
        <LangSwitcher lang={lang} setLang={setLang} />
      </div>
      <div className="ledger-head">
        <div>
          <p className="eyebrow">{t('appEyebrow')}</p>
          <h1>{t('portfolioTitle')}</h1>
        </div>
        {projects.length > 0 && (
          <div className="totals-block">
            <div>
              <span className="totals-label">{t('totalBudget')}</span>
              <span className="totals-value">{fmtEUR(totals.budget)}</span>
            </div>
            <div>
              <span className="totals-label">{t('totalSpent')}</span>
              <span className="totals-value">{fmtEUR(totals.spent)}</span>
            </div>
          </div>
        )}
      </div>

      {projects.length === 0 ? (
        <div className="empty-state">
          <FileText size={28} />
          <h2 className="empty-title">{t('emptyTitle')}</h2>
          <p className="empty-sub">{t('emptySub')}</p>
          <button className="btn-primary" onClick={() => setShowImport(true)}>
            <FileText size={15} /> {t('addCostOverview')}
          </button>
          <button className="btn-ghost" onClick={onLoadDemo}>{t('demoBtn')}</button>
          <p className="empty-sub demo-hint">{t('demoHint')}</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="ledger-table">
            <thead>
              <tr>
                <th>{t('colProject')}</th>
                <th>{t('colStatus')}</th>
                <th className="num">{t('colBudget')}</th>
                <th className="num">{t('colSpent')}</th>
                <th className="num">{t('colRemaining')}</th>
                <th>{t('colHistory')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => {
                const status = getStatus(p);
                const spent = getSpent(p);
                return (
                  <tr key={p.id} className="ledger-row" onClick={() => onSelect(p.id)}>
                    <td className="proj-name">{p.name}</td>
                    <td><StatusPill level={status.level} /></td>
                    <td className="num mono">{fmtEUR(p.budget)}</td>
                    <td className="num mono">{fmtEUR(spent)}</td>
                    <td className="num mono">{fmtEUR(p.budget - spent)}</td>
                    <td><Sparkline series={buildBurndownSeries(p)} budget={p.budget} /></td>
                    <td className="chevron"><ChevronRight size={16} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <button className="btn-add" onClick={() => setShowImport(true)}>
            <Plus size={16} /> {t('addCostOverview')}
          </button>
        </div>
      )}

      {showImport && (
        <ImportPdfPanel
          projects={projects}
          onImport={onImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Detail-Ansicht                                                      */
/* ------------------------------------------------------------------ */

function DetailView({ project, onBack, onAddBooking, onDeleteBooking, onDeleteProject, onImport, allProjects, lang, setLang }) {
  const [showAddOverview, setShowAddOverview] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState('');
  const [form, setForm] = useState({ areaId: project.areas?.[0]?.id || '', amount: '', date: todayISO(), note: '' });
  const [copied, setCopied] = useState(false);

  const spent = getSpent(project);
  const status = getStatus(project);
  const areaWarnings = getAreaWarnings(project);
  const allWarnings = [...status.warnings, ...areaWarnings];
  const forecast = getForecast(project);
  const series = buildBurndownSeries(project, forecastData ? forecastData.projectedFinalPct : null);
  const breakdown = getAreaBreakdown(project);
  const maxCat = Math.max(1, ...breakdown.map((b) => Math.max(b.amount || 0, b.spent, b.budget)));

  function submit(e) {
    e.preventDefault();
    if (!form.amount || !form.areaId) return;
    onAddBooking({ id: uid(), ...form, amount: Number(form.amount) });
    setForm({ areaId: project.areas?.[0]?.id || '', amount: '', date: todayISO(), note: '' });
  }

  const summary = [
    t('summaryHeader', project.name, fmtDate(TODAY)),
    t('summaryBudgetLine', fmtEUR(project.budget), fmtEUR(spent), Math.round(status.budgetPct * 100), fmtEUR(project.budget - spent)),
    t('summaryTimeLine', fmtDate(project.start), fmtDate(project.end), Math.round(status.timePct * 100)),
    t('summaryStatusLine', t(LEVEL_LABEL_KEY[status.level])),
    allWarnings.length ? t('summaryWarningsLine', allWarnings.join(' ')) : t('summaryNoIssues'),
    t('summaryForecastLine', forecast.text),
  ].join('\n');

  function copySummary() {
    navigator.clipboard?.writeText(summary).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  async function openForecastPanel() {
    setForecastLoading(true);
    setForecastError('');
    try {
      const result = await generateForecastAndTips(project);
      setForecastData(result);
    } catch (err) {
      const label = err?.name && err.name !== 'Error' ? `${err.name}: ` : '';
      setForecastError(label + (err?.message || ''));
    } finally {
      setForecastLoading(false);
    }
  }

  return (
    <div>
      <div className="top-bar no-print" style={{ justifyContent: 'flex-end' }}>
        <LangSwitcher lang={lang} setLang={setLang} />
      </div>
      <div className="detail-toolbar no-print">
        <button className="back-link" onClick={onBack}><ArrowLeft size={15} /> {t('backToPortfolio')}</button>
      </div>

      <div className="detail-head">
        <div>
          <p className="eyebrow">{fmtDate(project.start)} – {fmtDate(project.end)}</p>
          <h1>{project.name}</h1>
        </div>
        <StatusPill level={status.level} />
      </div>

      <div className="stat-row">
        <div className="stat-card">
          <span className="totals-label">{t('budgetLabel')}</span>
          <span className="stat-value mono">{fmtEUR(project.budget)}</span>
        </div>
        <div className="stat-card">
          <span className="totals-label">{t('spentLabel')}</span>
          <span className="stat-value mono">{fmtEUR(spent)}</span>
          <span className="stat-sub">{t('ofBudget', Math.round(status.budgetPct * 100))}</span>
        </div>
        <div className="stat-card">
          <span className="totals-label">{t('remainingLabel')}</span>
          <span className="stat-value mono">{fmtEUR(project.budget - spent)}</span>
        </div>
        <div className="stat-card">
          <span className="totals-label">{t('timeProgressLabel')}</span>
          <span className="stat-value mono">{Math.round(status.timePct * 100)}%</span>
        </div>
      </div>

      {allWarnings.length > 0 && (
        <div className="warning-box">
          <AlertTriangle size={16} />
          <div>{allWarnings.map((w, i) => <p key={i}>{w}</p>)}</div>
        </div>
      )}

      <div className="forecast-box">
        <TrendingUp size={15} />
        <span>{forecast.text}</span>
      </div>

      <section className="panel">
        <div className="summary-head">
          <h2>{t('aiForecastTitle')}</h2>
          {!forecastLoading && (
            <button className="btn-ghost small no-print" onClick={openForecastPanel}>
              <TrendingUp size={13} /> {forecastData ? t('retryBtn') : t('aiForecastBtn')}
            </button>
          )}
        </div>

        {!forecastLoading && !forecastError && !forecastData && (
          <p className="forecast-placeholder">{t('aiForecastEmptyHint')}</p>
        )}

        {forecastLoading && (
          <div className="analyzing-block">
            <Loader2 className="spin" size={20} />
            <span>{t('aiForecastLoading')}</span>
          </div>
        )}

        {!forecastLoading && forecastError && (
          <div className="warning-box modal-warning">
            <AlertTriangle size={16} />
            <div>
              <p>{forecastError}</p>
              <button className="btn-ghost small no-print" style={{ marginTop: 8 }} onClick={openForecastPanel}>{t('retryBtn')}</button>
            </div>
          </div>
        )}

        {!forecastLoading && !forecastError && forecastData && (() => {
          const trackMax = Math.max(150, forecastData.projectedFinalPct, forecastData.projectedFinalPctWithTips, 100);
          const markerPct = (100 / trackMax) * 100;
          const riskColor = LEVEL_COLOR[forecastData.riskLevel];
          return (
            <div className="forecast-panel-body">
              <span className="status-pill forecast-risk-pill" style={{ background: `${riskColor}1A`, color: riskColor, borderColor: `${riskColor}55` }}>
                <span className="status-dot" style={{ background: riskColor }} />
                {t(LEVEL_LABEL_KEY[forecastData.riskLevel])}
              </span>

              <h3>{t('aiForecastSectionForecast')}</h3>
              <p>{forecastData.forecast}</p>

              <div className="compare-block">
                <div className="compare-row">
                  <span className="compare-label">{t('compareWithoutTips')}</span>
                  <div className="compare-track">
                    <div className="compare-bar" style={{ width: `${Math.min(100, (forecastData.projectedFinalPct / trackMax) * 100)}%`, background: riskColor }} />
                    <div className="compare-marker" style={{ left: `${markerPct}%` }} />
                  </div>
                  <span className="compare-value mono">{Math.round(forecastData.projectedFinalPct)}%</span>
                </div>
                <div className="compare-row">
                  <span className="compare-label">{t('compareWithTips')}</span>
                  <div className="compare-track">
                    <div className="compare-bar good" style={{ width: `${Math.min(100, (forecastData.projectedFinalPctWithTips / trackMax) * 100)}%` }} />
                    <div className="compare-marker" style={{ left: `${markerPct}%` }} />
                  </div>
                  <span className="compare-value mono">{Math.round(forecastData.projectedFinalPctWithTips)}%</span>
                </div>
              </div>

              <h3>{t('aiForecastSectionTips')}</h3>
              <div className="tips-grid">
                {forecastData.tips.map((tip, i) => (
                  <div className="tip-card" key={i}>
                    <span className="tip-number">{String(i + 1).padStart(2, '0')}</span>
                    <span>{tip}</span>
                  </div>
                ))}
              </div>

              <h3>{t('aiForecastSectionOutlook')}</h3>
              <p>{forecastData.outlook}</p>
            </div>
          );
        })()}
      </section>

      <section className="panel">
        <h2>{t('burndownTitle')}</h2>
        <div className="chart-wrap">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={series} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="#22304F" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#93A0C2' }} axisLine={{ stroke: '#2C3B5C' }} tickLine={false} />
              <YAxis tickFormatter={(v) => fmtEUR(v)} tick={{ fontSize: 11, fill: '#93A0C2' }} axisLine={false} tickLine={false} width={80} />
              <Tooltip formatter={(v) => fmtEURPrecise(v)} labelStyle={{ color: '#EEF1F8' }} contentStyle={{ borderRadius: 6, border: '1px solid #2C3B5C', background: '#141F35', fontFamily: 'IBM Plex Sans, sans-serif', fontSize: 12, color: '#EEF1F8' }} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#93A0C2' }} />
              <ReferenceLine x={fmtDateShort(TODAY)} stroke="#5A6890" strokeDasharray="3,3" label={{ value: CURRENT_LANG === 'en' ? 'today' : CURRENT_LANG === 'ar' ? 'اليوم' : 'heute', fontSize: 11, fill: '#93A0C2' }} />
              <Line type="monotone" dataKey="geplant" name={CURRENT_LANG === 'en' ? 'planned (linear)' : CURRENT_LANG === 'ar' ? 'المخطط (خطي)' : 'geplant (linear)'} stroke="#5A6890" strokeWidth={2} dot={false} strokeDasharray="5,3" />
              <Line type="monotone" dataKey="ist" name={CURRENT_LANG === 'en' ? 'actual spend' : CURRENT_LANG === 'ar' ? 'الإنفاق الفعلي' : 'Ist-Verbrauch'} stroke="#C9A227" strokeWidth={2.4} dot={{ r: 2.5, fill: '#C9A227' }} connectNulls />
              {forecastData && (
                <Line type="monotone" dataKey="prognose" name={CURRENT_LANG === 'en' ? 'AI projection' : CURRENT_LANG === 'ar' ? 'التوقّع بالذكاء الاصطناعي' : 'KI-Prognose'} stroke="#E2574C" strokeWidth={2} strokeDasharray="4,3" dot={false} connectNulls />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel">
        <h2>{t('costAreasTitle')}</h2>
        <div className="breakdown">
          {breakdown.map((b) => {
            const over = b.budget > 0 && b.spent > b.budget;
            return (
              <div className="breakdown-row" key={b.id}>
                <span className="breakdown-label">{b.name}</span>
                <div className="breakdown-bar-track">
                  <div className={`breakdown-bar${over ? ' over' : ''}`} style={{ width: `${Math.min(100, (b.spent / maxCat) * 100)}%` }} />
                  {b.budget > 0 && (
                    <div className="breakdown-budget-marker" style={{ left: `${Math.min(100, (b.budget / maxCat) * 100)}%` }} />
                  )}
                </div>
                <span className={`breakdown-value mono${over ? ' over' : ''}`}>
                  {fmtEUR(b.spent)}{b.budget > 0 ? ` / ${fmtEUR(b.budget)}` : ''}
                </span>
              </div>
            );
          })}
          {breakdown.length === 0 && <p className="empty-row">{t('noAreasDefined')}</p>}
        </div>
      </section>

      <section className="panel">
        <div className="summary-head">
          <h2>{t('bookingsTitle')}</h2>
          <button className="btn-ghost small no-print" onClick={() => setShowAddOverview(true)}>
            <UploadCloud size={13} /> {t('addMoreOverview')}
          </button>
        </div>
        <form className="booking-form no-print" onSubmit={submit}>
          <select value={form.areaId} onChange={(e) => setForm({ ...form, areaId: e.target.value })}>
            {(project.areas || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <input type="number" min="0" placeholder={t('amountPlaceholder')} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <input type="text" placeholder={t('notePlaceholder')} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button type="submit" className="btn-primary small">{t('bookBtn')}</button>
        </form>

        <table className="bookings-table">
          <thead>
            <tr><th>{t('colDate')}</th><th>{t('colArea')}</th><th>{t('colNote')}</th><th className="num">{t('colAmount')}</th><th></th></tr>
          </thead>
          <tbody>
            {[...project.bookings].sort((a, b) => new Date(b.date) - new Date(a.date)).map((b) => (
              <tr key={b.id}>
                <td>{fmtDate(b.date)}</td>
                <td>{getAreaName(project, b.areaId)}</td>
                <td className="note-cell">{b.note || '—'}</td>
                <td className="num mono">{fmtEURPrecise(b.amount)}</td>
                <td>
                  <button className="icon-btn no-print" onClick={() => onDeleteBooking(b.id)} title={t('bookBtn')}>
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
            {project.bookings.length === 0 && (
              <tr><td colSpan={5} className="empty-row">{t('noBookingsYet')}</td></tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="summary-head">
          <h2>{t('summaryTitle')}</h2>
          <button className="btn-ghost small no-print" onClick={copySummary}>
            {copied ? <><Check size={13} /> {t('copiedBtn')}</> : <><Copy size={13} /> {t('copyBtn')}</>}
          </button>
        </div>
        <pre className="summary-block">{summary}</pre>
      </section>

      <button className="btn-danger no-print" onClick={() => { if (confirm(t('deleteProjectConfirm', project.name))) onDeleteProject(); }}>
        {t('deleteProjectBtn')}
      </button>

      {showAddOverview && (
        <ImportPdfPanel
          projects={allProjects || [project]}
          onImport={onImport}
          onClose={() => setShowAddOverview(false)}
          fixedTarget={project.id}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App                                                                  */
/* ------------------------------------------------------------------ */

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="app-root" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <h2>Etwas ist schiefgelaufen</h2>
            <p className="empty-sub" style={{ color: '#F2AFA6' }}>
              {this.state.error.name ? `${this.state.error.name}: ` : ''}{this.state.error.message || String(this.state.error)}
            </p>
            <button className="btn-primary" onClick={() => window.location.reload()}>Neu laden</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function loadJSON(key, timeoutMs = 4000) {
  const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
  return withTimeout(window.storage?.get(key), timeoutMs)
    .then((res) => (res?.value ? JSON.parse(res.value) : undefined))
    .catch(() => undefined);
}
function saveJSON(key, value) {
  window.storage?.set(key, JSON.stringify(value)).catch(() => {});
}

const PORTFOLIO_URL = 'https://projektmanagement.nadin.dev';

/* Fictional demo projects, dates relative to today so the status mix stays realistic. */
function demoProjects() {
  const iso = (offsetDays) => new Date(TODAY.getTime() + offsetDays * DAY).toISOString().slice(0, 10);
  const mk = (name, budget, startOff, endOff, areaDefs, rows) => {
    const areas = areaDefs.map(([n, b]) => ({ id: uid(), name: n, budget: b }));
    const bookings = rows.map(([areaIdx, amount, dayOff, note]) => ({ id: uid(), areaId: areas[areaIdx].id, amount, date: iso(dayOff), note }));
    return { id: uid(), name, budget, start: iso(startOff), end: iso(endOff), areas, bookings };
  };
  return [
    mk('Demo: CRM-Einführung (fiktiv)', 120000, -90, 90,
      [['Personal', 70000], ['Lizenzen', 25000], ['Extern', 20000], ['Sonstiges', 5000]],
      [[0, 9500, -85, 'Projektleitung Monat 1'], [1, 18000, -80, 'Jahreslizenzen'], [2, 12000, -70, 'Beratung Konzeption'],
       [0, 11000, -55, 'Projektleitung Monat 2'], [2, 9500, -40, 'Datenmigration extern'], [0, 12500, -25, 'Projektleitung Monat 3'],
       [3, 1800, -15, 'Schulungsraum'], [0, 9000, -5, 'Key-User-Schulung']]),
    mk('Demo: Messestand 2026 (fiktiv)', 45000, -30, 30,
      [['Standbau', 25000], ['Material', 10000], ['Reise', 7000], ['Sonstiges', 3000]],
      [[0, 14000, -28, 'Anzahlung Standbau'], [1, 4200, -20, 'Druckmaterial'], [2, 2600, -12, 'Hotel'], [0, 9000, -6, 'Restzahlung Standbau'],
       [1, 3100, -3, 'Give-aways']]),
  ];
}

/* Impressum (§ 18 Abs. 1 MStV) and privacy notice — German on purpose. */
const OWNER = {
  name: 'Nadin Okil',
  street: '[Straße und Hausnummer]', // TODO: ladungsfähige Anschrift (Pflicht nach § 18 MStV)
  city: '[PLZ Ort]',
  email: 'nadinokil.contact@gmail.com',
};

function LegalModal({ page, onClose }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel legal-text" role="dialog" aria-modal="true" lang="de" dir="ltr" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{page === 'imprint' ? 'Impressum' : 'Datenschutzerklärung'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Schließen" autoFocus><X size={16} /></button>
        </div>
        {page === 'imprint' ? (
          <>
            <p>Angaben gemäß § 18 Abs. 1 MStV</p>
            <p>{OWNER.name}<br />{OWNER.street}<br />{OWNER.city}</p>
            <p>E-Mail: <a href={`mailto:${OWNER.email}`}>{OWNER.email}</a></p>
            <p>Projekt-Budget-Tool ist ein privates, nicht-kommerzielles Portfolio-Projekt ohne Werbung, Einnahmen oder Konten.</p>
          </>
        ) : (
          <>
            <h3>Verantwortlich</h3>
            <p>{OWNER.name}, {OWNER.street}, {OWNER.city}, {OWNER.email}</p>
            <h3>Hosting</h3>
            <p>Die Seite wird von Vercel Inc. (340 S Lemon Ave #4133, Walnut, CA 91789, USA) ausgeliefert. Beim Aufruf verarbeitet Vercel technisch notwendige Daten (IP-Adresse, Zeitpunkt, angeforderte Datei, Browser-Kennung) in Server-Logs, um die Seite sicher auszuliefern. Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO. Für Übermittlungen in die USA stützt sich Vercel auf das EU-US Data Privacy Framework und Standardvertragsklauseln.</p>
            <h3>Ihre Eingaben</h3>
            <p>Es gibt kein Login und keine Datenbank. Projekte und Buchungen werden nur im sessionStorage dieses Browser-Tabs gespeichert und beim Schließen des Tabs automatisch gelöscht; jede Person, die den Link öffnet, startet mit einer leeren Seite. Mit „Alle Daten löschen“ unten auf der Seite entfernen Sie alles sofort.</p>
            <h3>KI-Funktionen (optional)</h3>
            <p>Nur wenn Sie eine PDF zur automatischen Erkennung hochladen oder eine KI-Prognose anfordern, wird der Inhalt (PDF bzw. Projektzahlen) über diese Seite an die API von Anthropic PBC (548 Market St, San Francisco, CA 94104, USA) gesendet und dort ausgewertet. Ich speichere diese Inhalte nicht. Rechtsgrundlage ist Ihre Handlung (Art. 6 Abs. 1 lit. a DSGVO). Bitte laden Sie keine Dokumente mit personenbezogenen oder vertraulichen Daten hoch – nutzen Sie dafür die Demo-Daten oder die manuelle Eingabe.</p>
            <h3>Keine Cookies, kein Tracking</h3>
            <p>Es werden keine Cookies gesetzt, keine Analyse-Dienste eingesetzt und keine externen Schriften oder Skripte geladen.</p>
            <h3>Ihre Rechte</h3>
            <p>Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch und Datenübertragbarkeit (Art. 15–21 DSGVO) sowie Beschwerde bei einer Aufsichtsbehörde (Art. 77 DSGVO).</p>
          </>
        )}
      </div>
    </div>
  );
}

function App() {
  // No login: one local workspace per browser. Older versions stored named
  // "accounts" with plain-text passwords; those passwords are stripped on load.
  const [activeWorkspace, setActiveWorkspace] = useState(null);
  const [workspacesLoaded, setWorkspacesLoaded] = useState(false);
  const [legalPage, setLegalPage] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [lang, setLang] = useState('de');
  const loadedRef = useRef(false);
  const langLoadedRef = useRef(false);
  const projectsLoadedForRef = useRef(null); // which workspace id the current `projects` state belongs to

  // Load language + workspace list (+ migrate legacy single-workspace data) once on mount.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const savedLang = await loadJSON('lang', 3000);
      if (!cancelled && savedLang && ['de', 'en', 'ar'].includes(savedLang)) setLang(savedLang);
      if (!cancelled) langLoadedRef.current = true;
    })();

    (async () => {
      let list = await loadJSON('workspaces', 4000);
      let active = await loadJSON('activeWorkspace', 2000);

      if (!Array.isArray(list)) list = [];

      if (list.length === 0) {
        // First run: migrate legacy single-workspace data if present.
        const legacyProjects = await loadJSON('projects', 3000);
        const id = uid();
        list = [{ id, name: t('defaultWorkspaceName') }];
        active = id;
        saveJSON(`projects:${id}`, Array.isArray(legacyProjects) ? legacyProjects : []);
      }
      if (!active || !list.find((w) => w.id === active)) active = list[0].id;
      // Remove stored passwords and the old "logged in" flag for good.
      saveJSON('workspaces', list.map(({ id, name }) => ({ id, name })));
      saveJSON('activeWorkspace', active);
      window.storage?.delete('accountConfirmed').catch(() => {});

      if (!cancelled) {
        setActiveWorkspace(active);
        setWorkspacesLoaded(true);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  // Load the active workspace's projects whenever it changes.
  useEffect(() => {
    if (!activeWorkspace) return;
    let cancelled = false;
    loadedRef.current = false;
    (async () => {
      const data = await loadJSON(`projects:${activeWorkspace}`, 4000);
      if (!cancelled) {
        setProjects(Array.isArray(data) ? data : []);
        setSelectedId(null);
        projectsLoadedForRef.current = activeWorkspace;
        loadedRef.current = true;
      }
    })();
    return () => { cancelled = true; };
  }, [activeWorkspace]);

  useEffect(() => {
    if (!loadedRef.current || projectsLoadedForRef.current !== activeWorkspace) return;
    saveJSON(`projects:${activeWorkspace}`, projects);
  }, [projects, activeWorkspace]);

  useEffect(() => {
    if (!langLoadedRef.current) return;
    saveJSON('lang', lang);
  }, [lang]);

  // Set the module-level "current language" synchronously before this render
  // pass produces any JSX, so every helper (fmtEUR, t(), getStatus, ...) below
  // reflects the right language for this render without threading `lang`
  // through every function signature.
  CURRENT_LANG = lang;

  function loadDemo() {
    setProjects([...projects, ...demoProjects()]);
  }
  async function deleteAllData() {
    if (!window.confirm(t('confirmDeleteAll'))) return;
    try {
      Object.keys(window.sessionStorage)
        .filter((k) => k.startsWith('projekt-budget-tool:'))
        .forEach((k) => window.sessionStorage.removeItem(k));
    } catch { /* storage unavailable */ }
    window.location.reload();
  }

  const selected = projects.find((p) => p.id === selectedId) || null;

  function addProject(p) { setProjects([...projects, p]); }
  function deleteProject(id) { setProjects(projects.filter((p) => p.id !== id)); setSelectedId(null); }
  function addBooking(booking) {
    setProjects(projects.map((p) => p.id === selectedId ? { ...p, bookings: [...p.bookings, booking] } : p));
  }
  function deleteBooking(bookingId) {
    setProjects(projects.map((p) => p.id === selectedId ? { ...p, bookings: p.bookings.filter((b) => b.id !== bookingId) } : p));
  }
  function handleImport(payload, target) {
    if (target === 'NEW') {
      setProjects([...projects, payload]);
      setSelectedId(payload.id);
    } else {
      setProjects(projects.map((p) => p.id === target ? { ...p, bookings: [...p.bookings, ...payload] } : p));
      setSelectedId(target);
    }
  }

  return (
    <div className="app-root" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      <style>{`
        [dir="rtl"] { font-family: 'Noto Sans Arabic', 'IBM Plex Sans', sans-serif; }
        [dir="rtl"] h1, [dir="rtl"] h2 { font-family: 'Noto Sans Arabic', 'Spectral', serif; }

        * { box-sizing: border-box; }
        .app-root {
          font-family: 'IBM Plex Sans', sans-serif;
          background: #0B1220;
          color: #EEF1F8;
          min-height: 100vh;
          padding: 32px 20px 80px;
        }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        h1 { font-family: 'Spectral', serif; font-weight: 600; font-size: 28px; margin: 2px 0 0; letter-spacing: -0.01em; color: #F5F0E0; }
        h2 { font-family: 'Spectral', serif; font-weight: 600; font-size: 17px; margin: 0 0 14px; color: #F5F0E0; }
        .eyebrow { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #93A0C2; margin: 0; font-weight: 500; }

        .loading-screen { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: 'IBM Plex Mono', monospace; color: #93A0C2; background: #0B1220; }

        .ledger-head { max-width: 980px; margin: 0 auto 28px; display: flex; justify-content: space-between; align-items: flex-end; flex-wrap: wrap; gap: 16px; border-bottom: 2px solid #C9A227; padding-bottom: 18px; }
        .totals-block { display: flex; gap: 28px; }
        .totals-block > div { display: flex; flex-direction: column; align-items: flex-end; }
        .totals-label { font-size: 11px; color: #93A0C2; text-transform: uppercase; letter-spacing: 0.06em; }
        .totals-value { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 600; color: #F5F0E0; }

        .table-wrap { max-width: 980px; margin: 0 auto; background: #141F35; border: 1px solid #263758; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
        .ledger-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .ledger-table thead th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #93A0C2; font-weight: 500; padding: 10px 14px; border-bottom: 1px solid #263758; background: #101A30; }
        .ledger-table td { padding: 12px 14px; border-bottom: 1px solid #1E2C4A; vertical-align: middle; color: #DDE3F0; }
        .ledger-row { cursor: pointer; transition: background 0.18s ease; }
        .ledger-row:hover { background: #182645; }
        .ledger-row:last-child td { border-bottom: none; }
        .proj-name { font-weight: 600; color: #F5F0E0; }
        .num { text-align: right; }
        .chevron { color: #5A6890; text-align: right; }

        .status-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 100px; border: 1px solid; white-space: nowrap; }
        .status-dot { width: 6px; height: 6px; border-radius: 50%; }

        .btn-add { max-width: 980px; margin: 16px auto 0; display: flex; align-items: center; gap: 6px; background: none; border: 1px dashed #3A4A70; color: #93A0C2; padding: 10px 16px; border-radius: 4px; cursor: pointer; font-size: 13px; width: 100%; justify-content: center; }
        .btn-add:hover { border-color: #C9A227; color: #E9C862; }

        .add-panel { max-width: 980px; margin: 16px auto 0; background: #141F35; border: 1px solid #263758; border-radius: 4px; padding: 20px; }
        .add-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
        .add-grid label { display: flex; flex-direction: column; font-size: 12px; color: #93A0C2; gap: 5px; }
        .add-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }

        input, select { font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; padding: 8px 10px; border: 1px solid #2C3B5C; border-radius: 4px; background: #0F1830; color: #EEF1F8; }
        input:focus, select:focus { outline: 2px solid #C9A227; outline-offset: 1px; }
        input::placeholder { color: #5A6890; }

        .btn-primary { background: #C9A227; color: #131B2E; border: none; padding: 9px 18px; border-radius: 5px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background 0.15s, transform 0.15s; }
        .btn-primary:hover { background: #E9C862; transform: translateY(-1px); }
        .btn-primary.small { padding: 8px 14px; }
        .btn-ghost { background: none; border: 1px solid #2C3B5C; color: #DDE3F0; padding: 9px 18px; border-radius: 4px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
        .btn-ghost:hover { border-color: #C9A227; color: #E9C862; }
        .btn-ghost.small { padding: 6px 12px; font-size: 12px; }
        .btn-danger { margin: 28px auto 0; display: block; background: none; border: 1px solid #E2574C55; color: #E2574C; padding: 9px 18px; border-radius: 4px; font-size: 13px; cursor: pointer; max-width: 980px; width: 100%; }
        .btn-danger:hover { background: #E2574C14; }

        .back-link { max-width: 980px; margin: 0 auto 18px; display: flex; align-items: center; gap: 6px; background: none; border: none; color: #93A0C2; font-size: 13px; cursor: pointer; padding: 0; }
        .back-link:hover { color: #E9C862; }
        .detail-head { max-width: 980px; margin: 0 auto 20px; display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #C9A227; padding-bottom: 16px; flex-wrap: wrap; gap: 12px; }

        .stat-row { max-width: 980px; margin: 0 auto 18px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .stat-card { background: #141F35; border: 1px solid #263758; border-radius: 6px; padding: 16px 18px; display: flex; flex-direction: column; gap: 4px; box-shadow: 0 4px 16px rgba(0,0,0,0.18); transition: transform 0.15s, border-color 0.15s; }
        .stat-card:hover { transform: translateY(-1px); border-color: #3A4A70; }
        .stat-value { font-size: 19px; font-weight: 600; color: #F5F0E0; }
        .stat-sub { font-size: 11px; color: #93A0C2; }

        .warning-box { max-width: 980px; margin: 0 auto 14px; background: #E2574C14; border: 1px solid #E2574C44; border-radius: 4px; padding: 12px 14px; display: flex; gap: 10px; font-size: 13px; color: #F2AFA6; }
        .warning-box svg { color: #E2574C; flex-shrink: 0; }
        .warning-box p { margin: 0 0 4px; }
        .warning-box p:last-child { margin-bottom: 0; }
        .forecast-box { max-width: 980px; margin: 0 auto 22px; background: #141F35; border: 1px solid #263758; border-radius: 4px; padding: 12px 14px; display: flex; gap: 10px; align-items: center; font-size: 13px; color: #DDE3F0; }
        .forecast-placeholder { font-size: 13px; color: #93A0C2; margin: 0; }
        .forecast-panel-body h3 { font-family: 'Spectral', serif; font-size: 14px; font-weight: 600; color: #F5F0E0; margin: 18px 0 8px; }
        .forecast-risk-pill { margin-bottom: 4px; }
        .compare-block { display: flex; flex-direction: column; gap: 10px; margin: 6px 0 4px; }
        .compare-row { display: grid; grid-template-columns: 130px 1fr 50px; align-items: center; gap: 10px; font-size: 12px; }
        .compare-label { color: #93A0C2; }
        .compare-track { position: relative; background: #0F1830; border-radius: 3px; height: 10px; overflow: visible; }
        .compare-bar { height: 100%; border-radius: 3px; background: #E2574C; transition: width 0.3s; }
        .compare-bar.good { background: #4F9E86; }
        .compare-marker { position: absolute; top: -3px; width: 2px; height: 16px; background: #EEF1F8; }
        .compare-value { text-align: right; color: #DDE3F0; }
        .tips-grid { display: flex; flex-direction: column; gap: 8px; }
        .tip-card { display: flex; align-items: flex-start; gap: 12px; background: #101A30; border: 1px solid #263758; border-radius: 5px; padding: 10px 12px; font-size: 13px; color: #DDE3F0; line-height: 1.5; transition: border-color 0.15s; }
        .tip-card:hover { border-color: #C9A227; }
        .tip-number { font-family: 'IBM Plex Mono', monospace; font-size: 11px; color: #C9A227; flex-shrink: 0; margin-top: 2px; letter-spacing: 0.03em; }
        .forecast-panel-body h3:first-child { margin-top: 0; }
        .forecast-panel-body p { font-size: 13px; line-height: 1.6; color: #DDE3F0; margin: 0; }
        .tips-list { margin: 0; padding-inline-start: 20px; font-size: 13px; line-height: 1.7; color: #DDE3F0; }
        .tips-list li { margin-bottom: 4px; }
        .forecast-box svg { color: #C9A227; flex-shrink: 0; }

        .panel { max-width: 980px; margin: 0 auto 22px; background: #141F35; border: 1px solid #263758; border-radius: 6px; padding: 22px; box-shadow: 0 4px 16px rgba(0,0,0,0.18); }
        .chart-wrap { margin: 0 -6px; }

        .breakdown { display: flex; flex-direction: column; gap: 10px; }
        .breakdown-row { display: grid; grid-template-columns: 100px 1fr 140px; align-items: center; gap: 12px; font-size: 13px; }
        .breakdown-label { color: #DDE3F0; }
        .breakdown-bar-track { position: relative; background: #0F1830; border-radius: 3px; height: 8px; overflow: visible; }
        .breakdown-bar { background: #C9A227; height: 100%; border-radius: 3px; }
        .breakdown-bar.over { background: #E2574C; }
        .breakdown-budget-marker { position: absolute; top: -3px; width: 2px; height: 14px; background: #EEF1F8; }
        .breakdown-value { text-align: right; color: #DDE3F0; }
        .breakdown-value.over { color: #E2574C; font-weight: 600; }

        .area-editor { margin: 16px 0 4px; border: 1px solid #263758; border-radius: 4px; padding: 14px; background: #101A30; }
        .area-editor-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
        .area-remaining { font-size: 12px; font-family: 'IBM Plex Mono', monospace; color: #4F9E86; }
        .area-remaining.over { color: #E2574C; }
        .area-row { display: grid; grid-template-columns: 1fr 140px auto; gap: 8px; margin-bottom: 8px; }
        .area-row input { background: #0F1830; }
        .area-add-btn { background: none; border: 1px dashed #3A4A70; color: #93A0C2; padding: 7px 12px; border-radius: 4px; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
        .area-add-btn:hover { border-color: #C9A227; color: #E9C862; }

        .booking-form { display: grid; grid-template-columns: 130px 120px 140px 1fr auto; gap: 10px; margin-bottom: 18px; }
        .bookings-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .bookings-table th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #93A0C2; font-weight: 500; padding: 8px 10px; border-bottom: 1px solid #263758; }
        .bookings-table td { padding: 9px 10px; border-bottom: 1px solid #1E2C4A; color: #DDE3F0; }
        .note-cell { color: #93A0C2; }
        .empty-row { text-align: center; color: #5A6890; padding: 20px !important; }
        .icon-btn { background: none; border: none; color: #5A6890; cursor: pointer; padding: 4px; display: flex; }
        .icon-btn:hover { color: #E2574C; }

        .summary-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .summary-head h2 { margin: 0; }
        .summary-block { font-family: 'IBM Plex Mono', monospace; font-size: 12px; background: #101A30; border: 1px solid #263758; border-radius: 4px; padding: 14px; white-space: pre-wrap; line-height: 1.6; color: #C7CEE3; margin: 0; }

        .add-btn-row { max-width: 980px; margin: 16px auto 0; display: flex; gap: 10px; }
        .add-btn-row .btn-add { margin: 0; }

        .empty-state { max-width: 480px; margin: 60px auto; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; color: #93A0C2; }
        .empty-state svg { color: #C9A227; margin-bottom: 4px; }
        .empty-title { margin: 0; color: #F5F0E0; }
        .empty-sub { font-size: 13px; line-height: 1.6; margin: 0 0 8px; }
        .empty-state .btn-primary { display: inline-flex; align-items: center; gap: 7px; }

        .mode-choice { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 4px 0 18px; }
        .mode-card { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; background: #101A30; border: 1px solid #263758; border-radius: 6px; padding: 16px; cursor: pointer; text-align: left; color: #DDE3F0; }
        .mode-card svg { color: #C9A227; }
        .mode-card:hover { border-color: #C9A227; background: #16213A; }
        .mode-card-title { font-family: 'Spectral', serif; font-weight: 600; font-size: 15px; color: #F5F0E0; }
        .mode-card-sub { font-size: 12px; color: #93A0C2; line-height: 1.5; }

        .modal-backdrop { position: fixed; inset: 0; background: rgba(5,9,20,0.7); display: flex; align-items: center; justify-content: center; padding: 20px; z-index: 50; }
        .modal-panel { background: #141F35; border: 1px solid #263758; border-radius: 6px; max-width: 720px; width: 100%; max-height: 88vh; overflow-y: auto; padding: 22px; }
        .modal-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .modal-head h2 { margin: 0; }
        .modal-warning { margin: 0; }

        .dropzone { display: flex; flex-direction: column; align-items: center; gap: 8px; border: 1.5px dashed #3A4A70; border-radius: 6px; padding: 40px 20px; cursor: pointer; color: #93A0C2; text-align: center; }
        .dropzone:hover { border-color: #C9A227; color: #E9C862; }
        .dropzone-sub { font-size: 12px; color: #5A6890; }

        .analyzing-block { display: flex; align-items: center; gap: 10px; padding: 40px 20px; justify-content: center; color: #93A0C2; font-size: 14px; }
        .spin { animation: spin 1s linear infinite; color: #C9A227; }
        @keyframes spin { to { transform: rotate(360deg); } }

        .review-hint { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #93A0C2; margin: 0 0 10px; }
        .review-table-wrap { max-height: 260px; overflow-y: auto; border: 1px solid #1E2C4A; border-radius: 4px; margin-bottom: 10px; }
        .review-input { width: 100%; padding: 5px 6px; font-size: 12px; border: 1px solid transparent; background: transparent; color: #DDE3F0; }
        .review-input:hover, .review-input:focus { border-color: #2C3B5C; background: #0F1830; }
        .review-total { text-align: right; font-size: 13px; margin: 0 0 14px; color: #DDE3F0; }
        .target-block { display: flex; align-items: center; gap: 10px; }
        .target-label { font-size: 12px; color: #93A0C2; }
        .target-block select { flex: 1; }
        .btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

        .detail-toolbar { max-width: 980px; margin: 0 auto 18px; display: flex; justify-content: space-between; align-items: center; }
        .detail-toolbar .back-link { margin: 0; }

        .top-bar { max-width: 980px; margin: 0 auto 14px; display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }

        .credit-footer { max-width: 980px; margin: 40px auto 0; text-align: center; font-size: 12px; color: #93A0C2; display: flex; flex-direction: column; gap: 10px; align-items: center; }
        .credit-footer p { margin: 0; max-width: 620px; line-height: 1.5; }
        .legal-links { display: flex; flex-wrap: wrap; gap: 6px 18px; justify-content: center; }
        .legal-links button, .legal-links a { background: none; border: none; padding: 0; color: #C7CEE0; font-size: 12px; text-decoration: underline; cursor: pointer; }
        .legal-links button:hover, .legal-links a:hover, .all-tools-link:hover { color: #E9C862; }
        .all-tools-link { color: #C7CEE0; font-size: 13px; text-decoration: underline; }
        .demo-hint { font-size: 12px; margin-top: -2px; }
        .legal-text { font-size: 14px; line-height: 1.6; color: #DDE3F0; }
        .legal-text h3 { font-size: 14px; margin: 16px 0 4px; color: #F5F0E0; }
        .legal-text p { margin: 0 0 8px; }
        .legal-text a { color: #E9C862; }

        .lang-switcher { margin: 0; display: flex; gap: 6px; }
        .lang-btn { background: none; border: 1px solid #2C3B5C; color: #93A0C2; padding: 5px 12px; border-radius: 4px; font-size: 12px; font-family: 'IBM Plex Mono', monospace; cursor: pointer; }
        .lang-btn:hover { border-color: #C9A227; color: #E9C862; }
        .lang-btn.active { background: #C9A227; border-color: #C9A227; color: #131B2E; font-weight: 600; }

        [dir="rtl"] .num { text-align: left; }
        [dir="rtl"] .chevron { transform: scaleX(-1); }
        [dir="rtl"] .back-link svg { transform: scaleX(-1); }
        [dir="rtl"] .totals-block, [dir="rtl"] .stat-row, [dir="rtl"] .mode-choice,
        [dir="rtl"] .add-grid, [dir="rtl"] .area-row, [dir="rtl"] .booking-form { direction: rtl; }
        [dir="rtl"] .breakdown-row { grid-template-columns: 140px 1fr 100px; }
        [dir="rtl"] .mono, [dir="rtl"] .summary-block { direction: ltr; text-align: right; unicode-bidi: plaintext; }

        @media print {
          .no-print { display: none !important; }
          .app-root { background: #fff !important; color: #111 !important; padding: 0 !important; }
          h1, h2 { color: #111 !important; }
          .eyebrow, .totals-label, .stat-sub, .review-hint, .note-cell, .breakdown-label { color: #555 !important; }
          .status-pill { border-color: #999 !important; }
          .detail-head { border-bottom-color: #111 !important; }
          .panel, .stat-card { background: #fff !important; border: 1px solid #ccc !important; break-inside: avoid; }
          .warning-box { background: #fff !important; border: 1px solid #c33 !important; color: #a00 !important; }
          .warning-box svg { color: #a00 !important; }
          .forecast-box { background: #fff !important; border: 1px solid #ccc !important; color: #111 !important; }
          .forecast-box svg { color: #111 !important; }
          .bookings-table td, .bookings-table th, .ledger-table td, .ledger-table th { color: #111 !important; border-color: #ddd !important; }
          .summary-block { background: #f7f7f7 !important; border: 1px solid #ccc !important; color: #111 !important; }
          .breakdown-bar-track { background: #eee !important; }
          .mono, .stat-value, .totals-value { color: #111 !important; }
        }

        @media (max-width: 720px) {
          .add-grid { grid-template-columns: 1fr 1fr; }
          .stat-row { grid-template-columns: 1fr 1fr; }
          .booking-form { grid-template-columns: 1fr 1fr; }
          .ledger-table thead th:nth-child(6), .ledger-table td:nth-child(6) { display: none; }
          .area-row { grid-template-columns: 1fr; }
          .mode-choice { grid-template-columns: 1fr; }
        }
      `}</style>

      {!workspacesLoaded ? null : selected ? (
        <DetailView
          project={selected}
          onBack={() => setSelectedId(null)}
          onAddBooking={addBooking}
          onDeleteBooking={deleteBooking}
          onDeleteProject={() => deleteProject(selected.id)}
          onImport={handleImport}
          allProjects={projects}
          lang={lang}
          setLang={setLang}
        />
      ) : (
        <PortfolioView
          projects={projects}
          onSelect={setSelectedId}
          onAdd={addProject}
          onDelete={deleteProject}
          onImport={handleImport}
          lang={lang}
          setLang={setLang}
          onLoadDemo={loadDemo}
        />
      )}
      <footer className="credit-footer no-print">
        <p>{t('localNote')}</p>
        <nav className="legal-links">
          <button onClick={() => setLegalPage('imprint')}>{t('imprint')}</button>
          <button onClick={() => setLegalPage('privacy')}>{t('privacy')}</button>
          <button onClick={deleteAllData}>{t('deleteAllData')}</button>
          <a href={PORTFOLIO_URL}>{t('allTools')}</a>
        </nav>
        <p>made by Nadin Okil</p>
      </footer>
      {legalPage && <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />}
    </div>
  );
}

export default function Root() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}
