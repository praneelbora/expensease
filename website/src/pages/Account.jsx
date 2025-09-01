import { useAuth } from '../context/AuthContext';
import MainLayout from '../layouts/MainLayout';
import { useEffect, useRef, useState, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAllExpenses } from '../services/ExpenseService';
import { updateUserProfile, deleteAccount } from '../services/UserService';
import CategoriesManage from '../components/SettingsCategoryManager';
import { logEvent } from "../utils/analytics";
import { getAllCurrencyCodes, toCurrencyOptions } from "../utils/currencies";
import CurrencyModal from '../components/CurrencyModal';
import { Check, Loader2 } from "lucide-react";
import SEO from '../components/SEO';

const TEST_MODE = import.meta.env.VITE_TEST_MODE;

export default function Account() {
    const { logout, user, userToken, defaultCurrency } = useAuth() || {};
    const location = useLocation();
    const navigate = useNavigate();

    // --- state
    const [dc, setDc] = useState(defaultCurrency || '');
    const [allCodes, setAllCodes] = useState([]);
    const [showDefaultModal, setShowDefaultModal] = useState(false);
    const [dcStatus, setDcStatus] = useState('idle'); // 'idle' | 'saving' | 'saved' | 'error'
    const [dcError, setDcError] = useState('');

    const [upiId, setUpiId] = useState(user?.upiId || '');
    const [upiStatus, setUpiStatus] = useState({ state: 'idle', msg: '' }); // 'idle' | 'saving' | 'saved' | 'error'

    const [loading, setLoading] = useState(!user && !!userToken);
    const [totals, setTotals] = useState({ balance: 0, expense: 0 });

    const [banner, setBanner] = useState(null); // { type: 'success' | 'error' | 'info', text }

    // highlight-on-scroll
    const [highlighted, setHighlighted] = useState(null); // 'upi' | 'paymentMethod' | 'guide' | 'currency' | 'category' | null
    const highlightTimerRef = useRef(null);

    // layout refs
    const headerRef = useRef(null);
    const scrollerRef = useRef(null);

    const upiRef = useRef(null);
    const upiInputRef = useRef(null);
    const paymentMethodRef = useRef(null);
    const guideRef = useRef(null);
    const currencyRef = useRef(null);
    // const categoryRef = useRef(null);

    // computed
    useEffect(() => { setAllCodes(getAllCurrencyCodes()); }, []);
    useEffect(() => { setDc(defaultCurrency || ''); }, [defaultCurrency]);
    const currencyOptions = useMemo(() => toCurrencyOptions(allCodes), [allCodes]);

    // fetch minimal totals (kept for parity; not displayed here but you may use later)
    const calculateTotals = (expenses, userId) => {
        let totalOwe = 0;
        let totalPay = 0;
        (expenses || []).forEach(exp => {
            const share = exp.splits?.find(s => s.friendId?._id === userId);
            if (!share) return;
            if (share.owing) totalOwe += exp.typeOf === 'expense' ? (share.oweAmount || 0) : 0;
            if (share.paying) totalPay += (share.payAmount || 0);
        });
        return { balance: totalPay - totalOwe, expense: totalOwe };
    };

    const fetchExpenses = async () => {
        try {
            const data = await getAllExpenses(userToken);
            setTotals(calculateTotals(data?.expenses || [], data?.id));
        } catch (error) {
            // non-blocking
            console.error("Error loading expenses:", error);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { fetchExpenses(); /* eslint-disable-next-line */ }, []);

    // scroll + highlight helper
    const scrollFocusAndHighlight = (ref, sectionKey, focusEl) => {
        if (!ref?.current) return;
        const scroller = scrollerRef.current;
        const headerH = headerRef.current?.getBoundingClientRect().height || 60;
        const pad = 40;
        if (scroller) {
            const targetY = Math.max(0, ref.current.offsetTop - headerH - pad);
            scroller.scrollTo({ top: targetY, behavior: 'smooth' });
        } else {
            const absoluteY = window.pageYOffset + ref.current.getBoundingClientRect().top - headerH - pad;
            window.scrollTo({ top: Math.max(0, absoluteY), behavior: 'smooth' });
        }

        if (focusEl?.current) setTimeout(() => focusEl.current?.focus?.(), 120);
        if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
        setHighlighted(sectionKey);
        highlightTimerRef.current = setTimeout(() => setHighlighted(null), 1500);
    };
    const highlightCls = (key) => highlighted === key ? 'ring-2 ring-inset ring-teal-500' : '';

    // query param deep-linking
    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const section = params.get('section');
        if (section === 'upi') scrollFocusAndHighlight(upiRef, 'upi', upiInputRef);
        if (section === 'paymentMethod') scrollFocusAndHighlight(paymentMethodRef, 'paymentMethod');
        if (section === 'guide') scrollFocusAndHighlight(guideRef, 'guide');
        if (section === 'currency') scrollFocusAndHighlight(currencyRef, 'currency');
        // if (section === 'category') scrollFocusAndHighlight(categoryRef, 'category');
        return () => { if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.search]);

    // sticky mini-nav active state (based on hash)
    const sectionLinks = [
        { id: 'upi-section', label: 'UPI' },
        { id: 'payment-method-section', label: 'Payment Accounts' },
        { id: 'currency-section', label: 'Currency' },
        { id: 'category-section', label: 'Categories' },
        { id: 'guide-section', label: 'Guide' },
    ];
    const currentHash = typeof window !== 'undefined' ? window.location.hash : '';

    // save default currency
    const saveCurrencyPrefs = async (curr) => {
        setDcStatus('saving');
        setDcError('');
        try {
            await updateUserProfile(userToken, { defaultCurrency: curr });
            logEvent('update_default_currency', { defaultCurrency: curr });
            setDcStatus('saved');
            setBanner({ type: 'success', text: 'Default currency updated.' });
            setTimeout(() => setDcStatus('idle'), 2000);
            setTimeout(() => setBanner(null), 2500);
        } catch (e) {
            console.error(e);
            setDcStatus('error');
            const msg = e?.message || 'Failed to save currency';
            setDcError(msg);
            setBanner({ type: 'error', text: msg });
            setTimeout(() => { setDcStatus('idle'); setDcError(''); setBanner(null); }, 3000);
        }
    };

    // save UPI (inline validation + feedback)
    const saveUpi = async () => {
        const v = (upiId || '').trim();
        if (!v) {
            setUpiStatus({ state: 'error', msg: 'Enter a UPI ID (e.g., name@bank).' });
            return;
        }
        const upiRegex = /^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z0-9.\-]{2,}$/;
        if (!upiRegex.test(v)) {
            setUpiStatus({ state: 'error', msg: 'That UPI ID doesn’t look right. Example: name@bank.' });
            return;
        }
        try {
            setUpiStatus({ state: 'saving', msg: '' });
            await updateUserProfile(userToken, { upiId: v });
            logEvent('update_upi', { screen: 'account' });
            setUpiStatus({ state: 'saved', msg: 'Saved ✓' });
            setBanner({ type: 'success', text: 'UPI ID saved.' });
            setTimeout(() => setUpiStatus({ state: 'idle', msg: '' }), 2000);
            setTimeout(() => setBanner(null), 2500);
        } catch (e) {
            console.error(e);
            const msg = e?.message || 'Failed to save UPI ID';
            setUpiStatus({ state: 'error', msg });
            setBanner({ type: 'error', text: msg });
            setTimeout(() => setBanner(null), 3000);
        }
    };

    return (
        <MainLayout>
            <SEO
                title="My Account | Expensease"
                description="Manage your account, settings, and preferences in Expensease. Keep your expense tracking personalized and efficient."
                canonical="https://www.expensease.in/account"
                schema={{
                    "@context": "https://schema.org",
                    "@type": "ProfilePage",
                    "name": "My Account | Expensease",
                    "description": "Manage your account, settings, and preferences in Expensease. Keep your expense tracking personalized and efficient.",
                    "url": "https://www.expensease.in/account"
                }}
            />

            <div className="h-full bg-[#121212] text-[#EBF1D5] flex flex-col px-4">
                {/* Header */}
                <div
                    ref={headerRef}
                    className="bg-[#121212] sticky -top-[5px] z-20 pb-2 border-b border-[#EBF1D5] flex flex-row items-center justify-between"
                >
                    <h1 className="text-3xl font-bold capitalize">My Account</h1>
                </div>

                {/* Sticky mini-nav */}
                {/* <nav className="sticky top-[52px] z-10 bg-[#121212]">
          <div className="flex gap-3 overflow-x-auto no-scrollbar border-b border-[#1e1e1e] px-1 py-2">
            {sectionLinks.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="shrink-0 px-3 py-1.5 text-sm rounded-md text-[#EBF1D5] hover:bg-white/5 aria-[current=true]:underline"
                aria-current={currentHash === `#${s.id}` ? 'true' : 'false'}
              >
                {s.label}
              </a>
            ))}
          </div>
        </nav> */}

                {/* Inline banner feedback */}
                {banner && (
                    <div
                        className={[
                            "mt-2 rounded-md px-3 py-2 text-sm",
                            banner.type === 'success' && "bg-teal-900/30 border border-teal-700 text-teal-200",
                            banner.type === 'error' && "bg-red-900/30 border border-red-700 text-red-200",
                            banner.type === 'info' && "bg-zinc-800 border border-zinc-600 text-zinc-200",
                        ].filter(Boolean).join(' ')}
                        role="status"
                        aria-live="polite"
                    >
                        {banner.text}
                    </div>
                )}

                {/* Content scroller */}
                <div
                    ref={scrollerRef}
                    className="flex flex-col flex-1 w-full overflow-y-auto pt-3 no-scrollbar gap-3"
                    style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
                >
                    {loading ? (
                        <div className="animate-pulse space-y-4 mt-3">
                            <div className="h-6 bg-gray-700 rounded w-1/3" />
                            <div className="h-4 bg-gray-700 rounded w-1/2" />
                            <div className="h-4 bg-gray-700 rounded w-2/3" />
                            <div className="h-6 bg-gray-700 rounded w-2/5" />
                        </div>
                    ) : (user || userToken) ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                            {/* Basic info */}
                            <section className="bg-[#1E1E1E] p-4 rounded-xl shadow">
                                <header className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm text-teal-500 uppercase tracking-wide">Account</h2>
                                    <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" />
                                </header>
                                <div className="space-y-2">
                                    <div>
                                        <p className="text-[12px] text-[#888]">Name</p>
                                        <h3 className="text-[15px] text-teal-500 capitalize font-semibold">{user?.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex-1">
                                            <p className="text-[12px] text-[#888]">Email</p>
                                            <h3 className="text-[15px] text-teal-500 lowercase font-semibold break-all">{user?.email}</h3>
                                        </div>
                                        {user?.email && (
                                            <button
                                                type="button"
                                                className="text-xs text-teal-400 underline"
                                                onClick={async () => {
                                                    await navigator.clipboard.writeText(user.email);
                                                    setBanner({ type: 'info', text: 'Email copied.' });
                                                    setTimeout(() => setBanner(null), 1500);
                                                }}
                                                aria-label="Copy email"
                                            >
                                                Copy
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </section>

                            {/* UPI */}
                            <section
                                ref={upiRef}
                                id="upi-section"
                                className={`bg-[#1E1E1E] p-4 rounded-xl shadow transition-all ${highlightCls('upi')}`}
                                aria-labelledby="upi-title"
                            >
                                <header className="flex items-center justify-between mb-2">
                                    <h2 id="upi-title" className="text-sm text-teal-500 uppercase tracking-wide">UPI for Quick Payments</h2>
                                    <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" />
                                </header>

                                <p className="text-xs text-[#888] mb-2 italic">
                                    Add your UPI ID so friends can pay you instantly. If you usually pay, ask your friend to add theirs.
                                </p>

                                <label htmlFor="upi-input" className="text-xs text-[#bbb]">Your UPI ID</label>
                                <div className="mt-1 flex gap-2">
                                    <input
                                        id="upi-input"
                                        ref={upiInputRef}
                                        value={upiId}
                                        onChange={(e) => setUpiId(e.target.value)}
                                        placeholder="yourname@bank"
                                        inputMode="email"
                                        className="flex-1 bg-[#2A2A2A] text-[#EBF1D5] px-3 py-2 text-[15px] rounded border border-transparent focus:outline-none focus:border-teal-600"
                                        aria-describedby="upiHelp"
                                    />
                                    <button
                                        onClick={saveUpi}
                                        className="px-3 py-2 rounded bg-teal-600 hover:bg-teal-700 font-semibold text-[14px]"
                                        disabled={upiStatus.state === 'saving'}
                                        aria-live="polite"
                                    >
                                        {upiStatus.state === 'saving' ? 'Saving…' : 'Save'}
                                    </button>
                                </div>
                                <p id="upiHelp" className="text-[11px] text-[#888] mt-1">
                                    Example: <span className="font-mono">name@bank</span>
                                </p>
                                {upiStatus.state === 'error' && (
                                    <p className="text-[12px] text-red-400 mt-1" aria-live="assertive">{upiStatus.msg}</p>
                                )}
                                {upiStatus.state === 'saved' && (
                                    <p className="text-[12px] text-teal-400 mt-1" aria-live="polite">{upiStatus.msg}</p>
                                )}
                            </section>

                            {/* Payment accounts (navigates) */}
                            <section
                                ref={paymentMethodRef}
                                id="payment-method-section"
                                role="button"
                                aria-label="Open payment accounts"
                                onClick={() => {
                                    logEvent('navigate', { fromScreen: 'account', toScreen: 'paymentAccounts', source: 'payment_method_section' });
                                    navigate('/paymentAccounts');
                                }}
                                className={`bg-[#1E1E1E] p-4 rounded-xl shadow cursor-pointer transition-colors hover:bg-white/5 active:bg-white/10 ${highlightCls('paymentMethod')}`}
                            >
                                <header className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm text-teal-500 uppercase tracking-wide">Payment Accounts</h2>
                                    <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" />
                                </header>
                                <p className="text-[#888] text-sm">Manage UPI, bank accounts, and cards for better expense tracking.</p>
                            </section>

                            {/* Guide (navigates) */}
                            <section
                                ref={guideRef}
                                id="guide-section"
                                role="button"
                                aria-label="Open guide"
                                onClick={() => {
                                    logEvent('navigate', { fromScreen: 'account', toScreen: 'guide', source: 'guide_section' });
                                    navigate('/guide');
                                }}
                                className={`bg-[#1E1E1E] p-4 rounded-xl shadow cursor-pointer transition-colors hover:bg-white/5 active:bg-white/10 ${highlightCls('guide')}`}
                            >
                                <header className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm text-teal-500 uppercase tracking-wide">Guide</h2>
                                    <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" />
                                </header>
                                <p className="text-[#888] text-sm">Quick tour: add expenses, split fairly, create groups, and settle up.</p>
                            </section>

                            {/* Default currency */}
                            <section
                                ref={currencyRef}
                                id="currency-section"
                                className={`bg-[#1E1E1E] p-4 rounded-xl shadow transition-all ${highlightCls('currency')}`}
                            >
                                <header className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm text-teal-500 uppercase tracking-wide">Default Currency</h2>
                                    <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" />
                                </header>

                                <div className="mt-1 relative">
                                    <button
                                        onClick={() => setShowDefaultModal(true)}
                                        className="w-full bg-[#2A2A2A] text-white px-3 py-2 rounded border border-transparent text-left pr-10"
                                        aria-haspopup="dialog"
                                        aria-expanded={showDefaultModal ? 'true' : 'false'}
                                    >
                                        {dc || 'Select'}
                                    </button>

                                    {dcStatus === 'saving' && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin" size={18} />
                                    )}
                                    {dcStatus === 'saved' && (
                                        <Check className="absolute right-3 top-1/2 -translate-y-1/2 text-teal-400" size={18} />
                                    )}
                                </div>

                                {dcStatus === 'saved' && (
                                    <p className="text-[12px] text-teal-400 mt-1" aria-live="polite">Saved ✓</p>
                                )}
                                {dcStatus === 'error' && (
                                    <p className="text-[12px] text-red-400 mt-1" aria-live="assertive">{dcError}</p>
                                )}

                                <p className="text-[11px] text-[#888] mt-2">
                                    Used for summaries. New expenses default to this currency so totals align.
                                </p>
                            </section>

                            {/* Currency picker modal */}
                            <CurrencyModal
                                show={showDefaultModal}
                                onClose={() => setShowDefaultModal(false)}
                                value={dc}
                                options={currencyOptions}
                                onSelect={(cur) => { setDc(cur); saveCurrencyPrefs(cur); setShowDefaultModal(false); }}
                            />

                            {/* Categories manage */}
                            {/* <section ref={categoryRef} id="category-section" className={`transition-all ${highlightCls('category')}`}>
                                <CategoriesManage userToken={userToken} highlightCls={highlightCls} />
                            </section> */}

                            {/* Support the developer (navigates) */}
                            <section
                                role="button"
                                aria-label="Support the developer"
                                onClick={() => {
                                    logEvent('navigate', { fromScreen: 'account', toScreen: 'supportdeveloper', source: 'support_developer_section' });
                                    navigate('/supportdeveloper');
                                }}
                                className="bg-[#1E1E1E] p-4 rounded-xl shadow flex flex-col justify-between cursor-pointer transition-colors hover:bg-white/5 active:bg-white/10"
                            >
                                <header className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm text-teal-500 uppercase tracking-wide">Support the Developer ☕</h2>
                                    <div className="w-[1px] self-stretch bg-[#212121]" aria-hidden="true" />
                                </header>
                                <p className="text-[#888] text-sm">
                                    If you find this platform helpful, consider supporting its development!
                                </p>
                            </section>

                            {/* Danger Zone */}
                            <div className="border border-[#2C2C2C] rounded-xl ">
                                <div className="bg-[#201f1f] px-4 py-3 border-b border-[#2C2C2C]">
                                    <h3 className="text-sm tracking-wide uppercase text-red-400">Danger Zone</h3>
                                </div>

                                <hr className="border-[#2C2C2C]" />
                                <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                                    <button
                                        onClick={() => {
                                            logEvent('logout', { fromScreen: 'account' });
                                            if (confirm('Log out of Expensease?')) logout();
                                        }}
                                        className="px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm"

                                    >
                                        Logout
                                    </button>
                                </div>

                            </div>

                            {TEST_MODE && (<section className="p-4 rounded-xl border border-red-900 bg-red-900/10">
                                <header className="flex items-center justify-between mb-2">
                                    <h2 className="text-sm text-red-400 uppercase tracking-wide">Danger Zone</h2>
                                    <div className="w-[1px] self-stretch bg-[#3a0e0e]" aria-hidden="true" />
                                </header>


                                <button
                                    className="px-4 py-2 rounded-md border border-red-500/70 text-red-400/90"
                                    onClick={async () => {
                                        try {
                                            if (!confirm('Delete your account permanently? This cannot be undone.')) return;
                                            await deleteAccount();
                                        } catch (e) {
                                            console.error(e);
                                            setBanner({ type: 'error', text: e?.message || 'Failed to delete account.' });
                                            setTimeout(() => setBanner(null), 3000);
                                        }
                                    }}
                                >
                                    Delete Account
                                </button>


                            </section>)}
                        </div>
                    ) : (
                        <p className="text-red-500">User not logged in.</p>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
