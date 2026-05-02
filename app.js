/*
    Main React app for the quote tool.

    This file owns the actual screens the rep/customer sees: builder view,
    customer quote view, print preview, and the modals. The goal is for this
    file to read like UI wiring, while the helper files handle pricing math,
    share links, PDF export, pagination, and object creation.

    If you need to change how something looks, you will probably be here. If
    you need to change what something costs or how totals are calculated, start
    in pricing.json or calculations.js instead.
*/
const { useState, useMemo, useEffect } = React;
const {
    loadPricingConfig,
    calculateQuote,
    createLine,
    copyLine,
    withPlanDefaultForType,
    createAdjustment,
    createOneTimeCredit,
    parseQuoteHash,
    createShareUrl,
    copyTextToClipboard,
    paginateQuote,
    saveQuotePdf
} = window.QuoteTool;

const Icon = ({ name, size = 18, className = "" }) => {
    const iconData = lucide.icons[name] || lucide[name];
    if (!iconData) return null;
    return (
        <svg
            width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            className={className}
        >
            {iconData.map(([tag, attrs], i) => React.createElement(tag, { ...attrs, key: i }))}
        </svg>
    );
};

const App = ({ config }) => {
    const SMARTPHONE_PLANS = config.smartphonePlans;
    const TABLET_PLANS = config.tabletPlans;
    const WATCH_PLANS = config.watchPlans;
    const HOME_INTERNET_PLANS = config.homeInternetPlans;
    const PERKS = config.perks;
    const FINANCING_MONTHS = config.quoteSettings.financingMonths;
    const [view, setView] = useState('rep');
    const [customerViewMode, setCustomerViewMode] = useState('detailed');
    const [customerName, setCustomerName] = useState('');
    const [showNameField, setShowNameField] = useState(false);
    const [lines, setLines] = useState([]);
    const [accountAdjustments, setAccountAdjustments] = useState([]);
    const [multiDeviceProtection, setMultiDeviceProtection] = useState(false);
    const [activePerkLineId, setActivePerkLineId] = useState(null);
    const [activeHardwareLineId, setActiveHardwareLineId] = useState(null);
    const [activeAdjLineId, setActiveAdjLineId] = useState(null);
    const [showAccountAdj, setShowAccountAdj] = useState(false);
    const [oneTimeCredits, setOneTimeCredits] = useState([]);
    const [showOneTimeCreditsModal, setShowOneTimeCreditsModal] = useState(false);
    const [editingLabelId, setEditingLabelId] = useState(null);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [includeEstimatedTaxes, setIncludeEstimatedTaxes] = useState(false);
    const [activeCustomTaxLineId, setActiveCustomTaxLineId] = useState(null);
    const [activeCustomProtectionLineId, setActiveCustomProtectionLineId] = useState(null);
    const [hardwareMode, setHardwareMode] = useState('');
    const [selectedDeviceManufacturer, setSelectedDeviceManufacturer] = useState('');
    const [selectedDeviceModel, setSelectedDeviceModel] = useState('');
    const [selectedDeviceStorage, setSelectedDeviceStorage] = useState('');
    const [hardwareAmountMode, setHardwareAmountMode] = useState('total');
    const [hardwarePromoMode, setHardwarePromoMode] = useState('credit');
    const [hardwareAmountInputs, setHardwareAmountInputs] = useState({ devicePrice: '', promoCredit: '' });
    
    // PDF Generation States
    const [scale, setScale] = useState(1);
    const [pdfHeight, setPdfHeight] = useState(1100);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // Share Link States
    const [isCopied, setIsCopied] = useState(false);

    // Import a quote from the URL once, then fall back to one blank phone line.
    useEffect(() => {
        let loadedFromHash = false;
        
        try {
            const state = parseQuoteHash(window.location.hash);
            if (state) {
                if (state.lines && state.lines.length > 0) {
                    setLines(state.lines);
                    loadedFromHash = true;
                }
                if (state.accountAdjustments) setAccountAdjustments(state.accountAdjustments);
                if (state.multiDeviceProtection !== undefined) setMultiDeviceProtection(state.multiDeviceProtection);
                if (state.oneTimeCredits) setOneTimeCredits(state.oneTimeCredits);
                if (state.includeEstimatedTaxes !== undefined) setIncludeEstimatedTaxes(state.includeEstimatedTaxes);
                if (state.customerName) {
                    setCustomerName(state.customerName);
                    setShowNameField(true);
                }
            }
        } catch (e) {
            console.error("Failed to load quote from URL", e);
        }
        
        if (!loadedFromHash && lines.length === 0) {
            addLine('Smartphone');
        }
    }, []);

    // Mobile view scaling logic ONLY for the print preview HTML Container
    useEffect(() => {
        const updateScale = () => {
            if (view === 'print') {
                if (window.innerWidth < 880) {
                    setScale((window.innerWidth - 32) / 850); 
                } else {
                    setScale(1);
                }
            }
        };
        window.addEventListener('resize', updateScale);
        updateScale();
        return () => window.removeEventListener('resize', updateScale);
    }, [view]);

    // Accurately measure dynamic height for drawing the red dashed preview lines
    useEffect(() => {
        if (view === 'print') {
            const checkHeight = () => {
                const el = document.getElementById('pdf-page-render-0');
                if (el && el.offsetHeight !== pdfHeight) {
                    setPdfHeight(el.offsetHeight);
                }
            };
            checkHeight();
            const interval = setInterval(checkHeight, 300); // Catch async font/icon loads
            return () => clearInterval(interval);
        }
    }, [view, pdfHeight, customerViewMode]);

    useEffect(() => {
        const line = lines.find(candidate => candidate.id === activeHardwareLineId);
        if (!line) return;

        setHardwareAmountInputs({
            devicePrice: getHardwareAmountValue(line.devicePrice, hardwareAmountMode),
            promoCredit: getHardwareAmountValue(line.promoCredit, hardwareAmountMode)
        });
    }, [activeHardwareLineId, hardwareAmountMode]);

    const handlePrintPreview = () => {
        setView('print');
        window.scrollTo(0, 0); // Always start preview at the top
    };

    const handleShareLink = () => {
        const shareUrl = createShareUrl({
            lines,
            accountAdjustments,
            multiDeviceProtection,
            oneTimeCredits,
            includeEstimatedTaxes,
            customerName
        });

        if (copyTextToClipboard(shareUrl)) {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000);
        }
    };

    const addLine = (type) => {
        setLines(prev => [...prev, createLine(type, prev.length + 1, config)]);
    };

    const copyLastLine = () => {
        if (lines.length === 0) return;
        const lastLine = lines[lines.length - 1];
        setLines(prev => [...prev, copyLine(lastLine, prev.length + 1)]);
    };

    const removeLine = (id) => setLines(prev => prev.filter(l => l.id !== id));
    
    const updateLine = (id, updates) => {
        setLines(prev => prev.map(l => (
            l.id === id ? withPlanDefaultForType(l, updates, config) : l
        )));
    };

    const openHardwareModal = (lineId) => {
        const line = lines.find(candidate => candidate.id === lineId);
        setActiveHardwareLineId(lineId);
        setHardwareMode('custom');
        setSelectedDeviceManufacturer('');
        setSelectedDeviceModel('');
        setSelectedDeviceStorage('');
        setHardwareAmountMode('total');
        setHardwarePromoMode(line && line.devicePrice > 0 && line.devicePrice === line.promoCredit ? 'free' : 'credit');
    };

    const closeHardwareModal = () => {
        setActiveHardwareLineId(null);
        setHardwareMode('');
        setSelectedDeviceManufacturer('');
        setSelectedDeviceModel('');
        setSelectedDeviceStorage('');
        setHardwareAmountMode('total');
        setHardwarePromoMode('credit');
    };

    const togglePerk = (lineId, perkName) => {
        setLines(prev => prev.map(l => {
            if (l.id === lineId) {
                const hasPerk = l.perks.includes(perkName);
                return { ...l, perks: hasPerk ? l.perks.filter(p => p !== perkName) : [...l.perks, perkName] };
            }
            return l;
        }));
    };

    const updateLineAdjustment = (index, updates) => {
        setLines(prev => prev.map(line => (
            line.id === activeAdjLineId
                ? { ...line, adjustments: line.adjustments.map((adjustment, idx) => idx === index ? { ...adjustment, ...updates } : adjustment) }
                : line
        )));
    };

    const removeLineAdjustment = (index) => {
        setLines(prev => prev.map(line => (
            line.id === activeAdjLineId
                ? { ...line, adjustments: line.adjustments.filter((_, idx) => idx !== index) }
                : line
        )));
    };

    const updateAdjustment = (index, updates) => {
        if (showAccountAdj) {
            setAccountAdjustments(prev => prev.map((adjustment, idx) => idx === index ? { ...adjustment, ...updates } : adjustment));
            return;
        }

        updateLineAdjustment(index, updates);
    };

    const removeAdjustment = (index) => {
        if (showAccountAdj) {
            setAccountAdjustments(prev => prev.filter((_, idx) => idx !== index));
            return;
        }

        removeLineAdjustment(index);
    };

    const addAdjustment = () => {
        const newAdj = createAdjustment();
        if (showAccountAdj) {
            setAccountAdjustments(prev => [...prev, newAdj]);
            return;
        }

        setLines(prev => prev.map(line => (
            line.id === activeAdjLineId
                ? { ...line, adjustments: [...line.adjustments, newAdj] }
                : line
        )));
    };

    const updateOneTimeCredit = (index, updates) => {
        setOneTimeCredits(prev => prev.map((credit, idx) => idx === index ? { ...credit, ...updates } : credit));
    };

    const removeOneTimeCredit = (index) => {
        setOneTimeCredits(prev => prev.filter((_, idx) => idx !== index));
    };

    const getPerkCost = (perkName) => (
        PERKS.find(perk => perk.name === perkName)?.cost || 0
    );

    const formatRoundedDollars = (amount) => `$${Math.round(amount).toLocaleString()}`;
    const formatDollars = (amount) => {
        const value = parseFloat(amount) || 0;
        const formatted = Math.abs(value).toFixed(2);
        return value < 0 ? `-$${formatted}` : `$${formatted}`;
    };

    const getHardwareAmountValue = (amount, mode = hardwareAmountMode) => {
        const totalAmount = parseFloat(amount) || 0;
        if (!totalAmount) return '';
        return mode === 'monthly'
            ? (totalAmount / FINANCING_MONTHS).toFixed(2)
            : String(totalAmount);
    };

    const getStorageSortValue = (storage = '') => {
        const match = String(storage).match(/(\d+(?:\.\d+)?)\s*(TB|GB)?/i);
        if (!match) return Number.MAX_SAFE_INTEGER;
        const size = parseFloat(match[1]);
        return match[2]?.toUpperCase() === 'TB' ? size * 1024 : size;
    };

    const getDeviceDisplayName = (device) => (
        [device.model, device.storage].filter(Boolean).join(' ')
    );

    const applyDeviceFromCatalog = (device) => {
        if (!device || !activeHardwareLineId) return;
        const devicePrice = parseFloat(device.price) || 0;
        const promoCredit = hardwarePromoMode === 'free' ? devicePrice : parseFloat(activeHardwareLine?.promoCredit) || 0;
        updateLine(activeHardwareLineId, {
            deviceName: getDeviceDisplayName(device),
            devicePrice,
            promoCredit
        });
        setHardwareAmountMode('total');
        setHardwareAmountInputs({
            devicePrice: devicePrice ? String(devicePrice) : '',
            promoCredit: promoCredit ? String(promoCredit) : ''
        });
        setHardwareMode('custom');
    };

    const getLineIconName = (lineType) => {
        if (lineType === 'Tablet') return 'Tablet';
        if (lineType === 'Watch') return 'Watch';
        if (lineType === 'Home Internet') return 'Wifi';
        return 'Smartphone';
    };

    const getOneTimeItemType = (item) => item.type || 'credit';

    const oneTimeCreditCount = oneTimeCredits.filter(item => getOneTimeItemType(item) === 'credit').length;
    const oneTimeChargeCount = oneTimeCredits.filter(item => getOneTimeItemType(item) === 'charge').length;
    const hasOneTimeCredits = oneTimeCreditCount > 0;
    const hasOneTimeCharges = oneTimeChargeCount > 0;
    const oneTimeDisplayLabel = hasOneTimeCredits && hasOneTimeCharges
        ? 'One-time charges & credits'
        : hasOneTimeCharges ? 'One-time charges' : 'One-time credits';
    const oneTimeDisplayIcon = hasOneTimeCharges ? 'DollarSign' : 'Gift';
    const oneTimeDisplayTotal = (amount) => {
        const formatted = Math.abs(amount).toFixed(2);
        if (amount < 0) return `-$${formatted}`;
        return `$${formatted}`;
    };

    const calculations = useMemo(() => calculateQuote({
        lines,
        multiDeviceProtection,
        accountAdjustments,
        oneTimeCredits,
        includeEstimatedTaxes
    }, config), [lines, multiDeviceProtection, accountAdjustments, oneTimeCredits, includeEstimatedTaxes, config]);

    const paginatedContent = useMemo(() => paginateQuote({
        calculations,
        customerViewMode,
        multiDeviceProtection,
        accountAdjustments,
        oneTimeCredits,
        includeEstimatedTaxes
    }), [calculations, customerViewMode, multiDeviceProtection, accountAdjustments, oneTimeCredits, includeEstimatedTaxes]);

    const handleSavePdf = async () => {
        await saveQuotePdf({ paginatedContent, customerName, setIsGeneratingPdf });
    };

    const activeHardwareLine = lines.find(l => l.id === activeHardwareLineId);
    const activeCustomTaxLine = lines.find(l => l.id === activeCustomTaxLineId);
    const activeCustomProtectionLine = lines.find(l => l.id === activeCustomProtectionLineId);
    const catalogDevicesForLine = (config.devices || [])
        .filter(device => device.enabled !== false && device.type === activeHardwareLine?.type);
    const deviceManufacturers = [...new Set(catalogDevicesForLine.map(device => device.manufacturer).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const manufacturerDevices = catalogDevicesForLine.filter(device => device.manufacturer === selectedDeviceManufacturer);
    const deviceModels = [...new Set(manufacturerDevices.map(device => device.model).filter(Boolean))].sort((a, b) => a.localeCompare(b));
    const modelDevices = manufacturerDevices
        .filter(device => device.model === selectedDeviceModel)
        .sort((a, b) => getStorageSortValue(a.storage) - getStorageSortValue(b.storage));
    const storageOptions = [...new Set(modelDevices.map(device => device.storage).filter(Boolean))]
        .sort((a, b) => getStorageSortValue(a) - getStorageSortValue(b));
    const handleDeviceManufacturerChange = (manufacturer) => {
        setSelectedDeviceManufacturer(manufacturer);
        setSelectedDeviceModel('');
        setSelectedDeviceStorage('');
    };
    const handleDeviceModelChange = (model) => {
        setSelectedDeviceModel(model);
        setSelectedDeviceStorage('');

        const matches = manufacturerDevices
            .filter(device => device.model === model)
            .sort((a, b) => getStorageSortValue(a.storage) - getStorageSortValue(b.storage));
        const uniqueStorageOptions = [...new Set(matches.map(device => device.storage).filter(Boolean))];

        // When there is no real storage choice, pick the device right away.
        if (matches.length === 1 || uniqueStorageOptions.length <= 1) {
            applyDeviceFromCatalog(matches[0]);
        }
    };
    const handleDeviceStorageChange = (storage) => {
        setSelectedDeviceStorage(storage);
        applyDeviceFromCatalog(modelDevices.find(device => device.storage === storage) || modelDevices[0]);
    };
    const updateHardwareAmount = (field, value) => {
        setHardwareAmountInputs(prev => ({ ...prev, [field]: value }));
        const amount = parseFloat(value) || 0;
        const totalAmount = hardwareAmountMode === 'monthly' ? amount * FINANCING_MONTHS : amount;

        if (field === 'devicePrice' && hardwarePromoMode === 'free') {
            updateLine(activeHardwareLineId, {
                devicePrice: totalAmount,
                promoCredit: totalAmount
            });
            setHardwareAmountInputs(prev => ({ ...prev, devicePrice: value, promoCredit: value }));
            return;
        }

        updateLine(activeHardwareLineId, {
            [field]: totalAmount
        });
    };
    const setPromoMode = (mode) => {
        setHardwarePromoMode(mode);

        if (mode === 'free') {
            const devicePrice = parseFloat(activeHardwareLine?.devicePrice) || 0;
            updateLine(activeHardwareLineId, { promoCredit: devicePrice });
            setHardwareAmountInputs(prev => ({
                ...prev,
                promoCredit: getHardwareAmountValue(devicePrice, hardwareAmountMode)
            }));
        }
    };
    const openDevicePicker = () => {
        setHardwareMode('catalog');
        setSelectedDeviceManufacturer('');
        setSelectedDeviceModel('');
        setSelectedDeviceStorage('');
        setHardwareAmountMode('total');
    };
    return (
        <div className="min-h-screen">
            {/* Only show nav if not currently in print preview mode */}
            {view !== 'print' && (
                <nav className="sticky top-0 z-50 px-4 md:px-6 py-4 border-b border-black/10 flex justify-between items-center bg-stone-100/80 backdrop-blur-md text-black">
                    <div className="flex items-center gap-2">
                        <button onClick={() => setIsMenuOpen(true)} title="Open menu" className="p-1.5 transition-colors flex items-center justify-center text-black/60 hover:text-black">
                            <Icon name="Menu" size={18} />
                        </button>
                        <span className="h-5 w-px bg-black/20"></span>
                        <span className="text-base md:text-lg font-black tracking-tight">verizon</span>
                        <span className="h-5 w-px bg-black/20"></span>
                        <span className="text-base md:text-lg font-light tracking-tight opacity-60">TCC</span>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3">
                        <button onClick={handleShareLink} title={isCopied ? "Copied!" : "Copy Share Link"} className="p-2 md:p-2.5 rounded-full transition-all flex items-center justify-center shadow-sm border border-black/10 bg-white text-black hover:bg-black hover:text-white relative">
                            {isCopied ? <Icon name="Check" size={16} className="text-emerald-500" /> : <Icon name="Link" size={16}/>}
                        </button>
                        <button onClick={handlePrintPreview} title="Print Preview" className="p-2 md:p-2.5 rounded-full transition-all flex items-center justify-center shadow-sm border border-black/10 bg-white text-black hover:bg-black hover:text-white">
                            <Icon name="Printer" size={16}/>
                        </button>
                        <div className="flex gap-1 md:gap-2 p-1 bg-black/5 rounded-full">
                            <button onClick={() => setView('rep')} className={`px-2.5 md:px-6 py-1.5 md:py-2 rounded-full text-[10px] md:text-sm font-bold transition-all flex items-center gap-2 ${view === 'rep' ? 'bg-black text-white' : 'text-black/60 hover:text-black'}`}><Icon name="Settings" size={14} /> <span className="hidden sm:inline">Rep view</span><span className="sm:hidden">Rep</span></button>
                            <button onClick={() => setView('customer')} className={`px-2.5 md:px-6 py-1.5 md:py-2 rounded-full text-[10px] md:text-sm font-bold transition-all flex items-center gap-2 ${view === 'customer' ? 'bg-black text-white' : 'text-black/60 hover:text-black'}`}><Icon name="Eye" size={14} /> <span className="hidden sm:inline">Customer view</span><span className="sm:hidden">Cust</span></button>
                        </div>
                    </div>
                </nav>
            )}

            {isMenuOpen && (
                <div className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm" onClick={() => setIsMenuOpen(false)}>
                    <aside className="h-full w-[300px] max-w-[82vw] bg-white text-black shadow-2xl border-r border-black/10 p-6 flex flex-col gap-6" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="text-xl font-black">Quote Options</h2>
                            </div>
                            <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-black/5 rounded-full transition-colors">
                                <Icon name="X" size={22} />
                            </button>
                        </div>

                        <button onClick={() => setIncludeEstimatedTaxes(prev => !prev)} className="w-full bg-stone-50 border border-black/10 rounded-2xl p-4 flex items-center justify-between text-left hover:border-black/20 transition-colors">
                            <div>
                                <p className="text-sm font-black">Est. Tax/Sur.</p>
                            </div>
                            <span className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${includeEstimatedTaxes ? 'bg-verizon-red' : 'bg-gray-300'}`}>
                                <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${includeEstimatedTaxes ? 'right-1' : 'left-1'}`} />
                            </span>
                        </button>
                    </aside>
                </div>
            )}

            <main className={view === 'print' ? 'w-full' : 'max-w-[1340px] mx-auto p-4 md:p-6 mb-24 text-black'}>
                {view === 'rep' && (
                    <div className="space-y-6">
                        <header>
                            <h1 className="text-2xl md:text-3xl font-black leading-tight text-black">Quote builder.</h1>
                            <p className="text-xs md:text-sm opacity-60 font-medium text-black">Configure hardware and lines.</p>
                            
                            {!showNameField ? (
                                <button onClick={() => setShowNameField(true)} className="mt-2 text-[10px] font-bold uppercase tracking-widest text-black/40 hover:text-black flex items-center gap-1 transition-colors"><Icon name="Plus" size={12} /> Add customer name</button>
                            ) : (
                                <div className="mt-3 flex items-center gap-3 max-w-sm animate-in fade-in slide-in-from-left-2 duration-200">
                                    <input value={customerName} onFocus={e => e.target.select()} onChange={e => setCustomerName(e.target.value)} placeholder="Customer Name" className="flex-grow bg-white border border-black/10 px-3 py-2 rounded-lg text-xs font-bold focus:border-black outline-none" />
                                    <button onClick={() => { setShowNameField(false); setCustomerName(''); }} className="p-2 text-black/20 hover:text-verizon-red transition-colors"><Icon name="Trash2" size={16} /></button>
                                </div>
                            )}
                        </header>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-white p-5 border border-black/10 rounded-xl flex items-center justify-between shadow-sm">
                                <div><p className="font-bold text-sm">Multi-Device Protection</p><p className="text-[11px] opacity-50 font-medium">${calculations.vmpCost.toFixed(2)}/mo total</p></div>
                                <button onClick={() => setMultiDeviceProtection(!multiDeviceProtection)} className={`w-11 h-6 rounded-full relative transition-colors ${multiDeviceProtection ? 'bg-verizon-red' : 'bg-gray-300'}`}><div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${multiDeviceProtection ? 'right-1' : 'left-1'}`} /></button>
                            </div>
                            <button onClick={() => setShowAccountAdj(true)} className="bg-white p-5 border border-black/10 rounded-xl flex items-center justify-between shadow-sm hover:border-black transition-colors text-left">
                                <div><p className="font-bold text-sm">Account adjustments</p><p className="text-[11px] opacity-50 font-medium">{accountAdjustments.length} adjustment(s)</p></div>
                                <Icon name="PlusCircle" size={22} className="opacity-40" />
                            </button>
                            <button onClick={() => setShowOneTimeCreditsModal(true)} className="bg-white p-5 border border-black/10 rounded-xl flex items-center justify-between shadow-sm hover:border-black transition-colors text-left">
                                <div><p className="font-bold text-sm">One-time charges & credits</p><p className="text-[11px] opacity-50 font-medium">{oneTimeCredits.length} item(s)</p></div>
                                <Icon name="PlusCircle" size={22} className="opacity-40" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            {calculations.processedLines.map(line => (
                                <div key={line.id} className="bg-white border border-black/10 rounded-xl overflow-hidden shadow-sm">
                                    <div className="p-4 md:p-5 flex flex-col lg:flex-row gap-6">
                                        <div className="w-full lg:w-48 xl:w-64 space-y-2 shrink-0">
                                            <div className="flex items-center gap-2">
                                                {editingLabelId === line.id ? (
                                                    <input autoFocus value={line.label} className="text-xs font-bold border-b border-black outline-none bg-transparent w-full text-black" onBlur={() => setEditingLabelId(null)} onKeyDown={e => e.key === 'Enter' && setEditingLabelId(null)} onChange={e => updateLine(line.id, { label: e.target.value })} />
                                                ) : (
                                                    <div className="flex items-center gap-2 group cursor-pointer" onClick={() => setEditingLabelId(line.id)}><span className="text-xs font-bold opacity-60 group-hover:opacity-100">{line.label}</span><Icon name="Edit2" size={10} className="opacity-20" /></div>
                                                )}
                                            </div>
                                            <select value={line.type} onChange={e => updateLine(line.id, { type: e.target.value, perks: [] })} className="w-full px-3 py-2 bg-stone-50 border border-black/5 rounded-lg text-sm font-bold outline-none text-black">
                                                <option>Smartphone</option><option>Tablet</option><option>Watch</option><option>Home Internet</option><option>Custom</option>
                                            </select>
                                            {line.type === 'Custom' && <input value={line.customLineTypeLabel} onFocus={e => e.target.select()} onChange={e => updateLine(line.id, { customLineTypeLabel: e.target.value })} placeholder="Legacy Line Label" className="w-full bg-white border border-black/10 px-3 py-2 rounded-lg text-xs font-bold focus:border-black outline-none" />}
                                            {line.type !== 'Custom' && (
                                                <select value={line.planName} onChange={e => updateLine(line.id, { planName: e.target.value })} className="w-full px-3 py-2 bg-stone-50 border border-black/5 rounded-lg text-sm font-bold outline-none text-black">
                                                    {line.type === 'Smartphone' && SMARTPHONE_PLANS.map(p => <option key={p.name}>{p.name}</option>)}
                                                    {line.type === 'Tablet' && TABLET_PLANS.map(p => <option key={p.name}>{p.name}</option>)}
                                                    {line.type === 'Watch' && WATCH_PLANS.map(p => <option key={p.name}>{p.name}</option>)}
                                                    {line.type === 'Home Internet' && HOME_INTERNET_PLANS.map(p => <option key={p.name}>{p.name}</option>)}
                                                </select>
                                            )}
                                            {(line.planName === 'Custom' || line.type === 'Custom') && (
                                                <div className="mt-2 space-y-3 p-3 bg-stone-100 rounded-xl border border-black/5">
                                                    <input value={line.customPlanName} onFocus={e => e.target.select()} onChange={e => updateLine(line.id, { customPlanName: e.target.value })} placeholder="Custom Plan Name" className="w-full bg-white border border-black/10 px-2 py-1.5 rounded-lg text-xs font-bold focus:border-black outline-none" />
                                                    <div className="grid grid-cols-2 gap-2 text-black">
                                                        <div className="space-y-0.5"><label className="text-[8px] font-bold uppercase opacity-40">Base Price</label><input type="number" inputMode="decimal" onWheel={e => e.currentTarget.blur()} value={line.customPlanPrice || ''} onFocus={e => e.target.select()} onChange={e => updateLine(line.id, { customPlanPrice: e.target.value })} placeholder="0.00" className="w-full bg-white border border-black/10 px-2 py-1.5 rounded-lg text-xs font-bold focus:border-black outline-none" /></div>
                                                        <div className="space-y-0.5"><label className="text-[8px] font-bold uppercase opacity-40">AP Disc</label><input type="number" inputMode="decimal" onWheel={e => e.currentTarget.blur()} value={line.customAutopayDiscount || ''} onFocus={e => e.target.select()} onChange={e => updateLine(line.id, { customAutopayDiscount: e.target.value })} placeholder="0.00" className="w-full bg-white border border-black/10 px-2 py-1.5 rounded-lg text-xs font-bold focus:border-black outline-none" /></div>
                                                    </div>
                                                    {line.type === 'Smartphone' && (
                                                        <div className="flex items-center justify-between text-[10px] font-bold opacity-60"><span>Slots:</span><div className="flex items-center gap-2 bg-white px-2 py-1 rounded-md border border-black/10"><button onClick={() => updateLine(line.id, { customDiscountSlots: Math.max(0, (parseInt(line.customDiscountSlots) || 0) - 1) })}>-</button><span className="font-black">{line.customDiscountSlots}</span><button onClick={() => updateLine(line.id, { customDiscountSlots: (parseInt(line.customDiscountSlots) || 0) + 1 })}>+</button></div></div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex-grow border-t lg:border-t-0 lg:border-l border-black/5 pt-5 lg:pt-0 pl-0 lg:pl-6 space-y-3 shrink-0 min-w-[280px]">
                                            <span className="text-[11px] font-bold text-black/40 block uppercase tracking-wider">Hardware</span>
                                            {line.type !== 'Home Internet' ? (
                                                <div className="flex flex-row gap-3 md:gap-4 items-center">
                                                    <button onClick={() => openHardwareModal(line.id)} className="hardware-btn flex-1 basis-1/2 w-full min-w-0 md:min-w-[220px] px-4 md:px-6 py-4 bg-stone-50 border border-black/5 rounded-xl hover:bg-black hover:text-white flex items-center gap-3 text-left shadow-sm active:scale-95 transition-all text-black"><Icon name="Smartphone" size={20} className="shrink-0" /><div className="flex flex-col min-w-0"><span className="text-sm font-bold truncate max-w-[160px]">{line.deviceName || 'Select device'}</span><span className="text-[10px] opacity-60 font-medium">Configure</span></div></button>
                                                    <div className="flex flex-col flex-1 basis-1/2 min-w-0 items-center text-center"><span className="text-[10px] opacity-40 font-bold uppercase tracking-wider">MONTHLY PAYMENT</span><span className="text-xl font-black">{formatDollars(line.deviceMonthly)}</span></div>
                                                </div>
                                            ) : <div className="h-full flex items-center text-black/20 italic text-sm">Not applicable</div>}
                                        </div>

                                        <div className="w-full lg:w-52 lg:shrink-0 grid grid-cols-2 lg:flex lg:flex-col gap-2 border-t lg:border-t-0 lg:border-l border-black/5 pt-5 lg:pt-0 pl-0 lg:pl-6">
                                            <span className="col-span-2 text-[11px] font-bold text-black/40 uppercase tracking-wider">Add-ons & Adjust</span>
                                            <button onClick={() => setActivePerkLineId(line.id)} className="flex items-center justify-between px-3 lg:px-5 py-3 bg-yellow-100 border border-yellow-300 rounded-lg text-xs font-bold hover:bg-yellow-200 transition-colors text-left text-black"><span className="flex items-center gap-2 min-w-0"><Icon name="Gift" size={16}/> Perks ({line.perks.length})</span><Icon name="ChevronRight" size={16} /></button>
                                            <button onClick={() => setActiveAdjLineId(line.id)} className="flex items-center justify-between px-3 lg:px-5 py-3 bg-stone-100 border border-stone-300 rounded-lg text-xs font-bold hover:bg-stone-200 transition-colors text-left text-black"><span className="flex items-center gap-2 min-w-0"><Icon name="PlusCircle" size={16}/> Adjust ({line.adjustments.length})</span><Icon name="ChevronRight" size={16} /></button>
                                            {includeEstimatedTaxes && line.type === 'Custom' && (
                                                <button onClick={() => setActiveCustomTaxLineId(line.id)} className="col-span-2 flex items-center justify-between px-5 py-2.5 border rounded-lg text-xs font-bold transition-all bg-stone-50 text-black/60 hover:bg-stone-100"><span className="flex items-center gap-2"><Icon name="ReceiptText" size={16} /> Taxes/Sur.</span><span className="text-black/40">${parseFloat(line.customTaxSurcharge || 0).toFixed(2)}</span></button>
                                            )}
                                            {!multiDeviceProtection && line.type !== 'Custom' && line.type !== 'Home Internet' && (
                                                <button onClick={() => updateLine(line.id, { individualProtection: !line.individualProtection })} className={`col-span-2 flex items-center gap-2 px-5 py-2.5 border rounded-lg text-xs font-bold transition-all ${line.individualProtection ? 'bg-black text-white' : 'bg-stone-50 text-black/60'}`}><Icon name="ShieldCheck" size={16} /> {line.individualProtection ? 'VMP protected' : 'Add protection'}</button>
                                            )}
                                            {!multiDeviceProtection && line.type === 'Custom' && (
                                                <button onClick={() => setActiveCustomProtectionLineId(line.id)} className={`col-span-2 flex items-center justify-between px-5 py-2.5 border rounded-lg text-xs font-bold transition-all ${parseFloat(line.customProtectionCost || 0) > 0 ? 'bg-black text-white' : 'bg-stone-50 text-black/60'}`}><span className="flex items-center gap-2"><Icon name="ShieldCheck" size={16} /> {parseFloat(line.customProtectionCost || 0) > 0 ? 'VMP protected' : 'Add protection'}</span>{parseFloat(line.customProtectionCost || 0) > 0 && <span>${parseFloat(line.customProtectionCost || 0).toFixed(2)}</span>}</button>
                                            )}
                                            {multiDeviceProtection && line.type === 'Custom' && (
                                                <button onClick={() => updateLine(line.id, { customIncludeInVmdp: !line.customIncludeInVmdp })} className={`col-span-2 flex items-center gap-2 px-5 py-2.5 border rounded-lg text-xs font-bold transition-all ${line.customIncludeInVmdp ? 'bg-black text-white' : 'bg-stone-50 text-black/60'}`}><Icon name="ShieldCheck" size={16} /> Include in VMDP</button>
                                            )}
                                            <button onClick={() => removeLine(line.id)} className="col-span-2 mt-auto flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-verizon-red hover:bg-red-50 rounded-lg transition-colors"><Icon name="Trash2" size={16} /> Remove line</button>
                                        </div>

                                        <div className="w-full lg:w-36 lg:shrink-0 flex flex-col items-end justify-center border-t lg:border-t-0 lg:border-l border-black/5 pt-5 lg:pt-0 pl-0 lg:pl-6 bg-stone-50/50 -my-5 py-5 pr-5">
                                            <span className="text-[10px] font-bold text-black/40 uppercase tracking-widest text-right">Line total</span>
                                            <span className="text-2xl font-black">${line.totalLineCost.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-row gap-4 mt-8">
                            <button onClick={() => addLine('Smartphone')} className="flex-grow py-8 border-2 border-dashed border-black/10 rounded-2xl flex flex-col items-center justify-center gap-2 text-black/40 hover:text-verizon-red hover:border-red-200 transition-all group"><div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center group-hover:scale-110 transition-transform"><Icon name="Plus" size={24} /></div><span className="font-bold text-base">Add a line</span></button>
                            <button onClick={copyLastLine} className="shrink-0 px-6 md:px-10 py-8 border-2 border-dashed border-black/10 rounded-2xl flex flex-col items-center justify-center gap-2 text-black/40 hover:text-black hover:border-black/20 hover:bg-stone-50 transition-all group"><div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center group-hover:scale-110 transition-transform"><Icon name="Copy" size={20} /></div><span className="font-bold text-sm opacity-60 group-hover:opacity-100 whitespace-nowrap">Copy last</span></button>
                        </div>

                        <div className="mt-12 mx-auto max-w-xl p-6 bg-black text-white rounded-[32px] shadow-2xl flex flex-col md:flex-row justify-between items-center gap-6">
                            <div className="flex-1 text-center md:text-left"><h3 className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mb-1 opacity-60">Estimated Monthly Total</h3><div className="flex items-baseline justify-center md:justify-start gap-1"><span className="text-3xl md:text-4xl font-black tracking-tighter">${calculations.total.toFixed(2)}</span><span className="text-stone-400 text-xs font-bold opacity-40">/mo</span></div></div>
                            <div className="space-y-1 text-[11px] text-stone-400 font-medium text-center md:text-right border-t md:border-t-0 md:border-l border-white/10 pt-4 md:pt-0 md:pl-8"><p>Total lines: <span className="text-white font-bold">{lines.length}</span></p>{multiDeviceProtection && <p>Multi-Device: <span className="text-white font-bold">Included</span></p>}</div>
                            <button onClick={() => setView('customer')} className="w-full md:w-auto px-6 py-3.5 bg-verizon-red hover:bg-red-600 text-white rounded-xl font-black text-sm transition-all transform active:scale-95 flex items-center justify-center gap-2 shadow-lg">Generate Quote <Icon name="ChevronRight" size={18} /></button>
                        </div>
                    </div>
                )}

                {view === 'customer' && (
                    /* CUSTOMER VIEW */
                    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-6 duration-500 pb-20 text-black">
                        <header className="text-center space-y-1">
                            <h1 className="text-2xl md:text-3xl font-black text-black tracking-tight leading-none">{customerName.trim() ? <>Hey {customerName.trim().split(' ')[0]},<br />Here's Your Verizon Quote.</> : "Your Verizon Quote."}</h1>
                            <p className="text-sm md:text-base text-black/60 font-medium italic opacity-70">Reliable, clear, and built for you.</p>
                        </header>
                        <div className="bg-white rounded-[40px] shadow-xl overflow-hidden border border-black/5">
                            <div className="bg-verizon-red p-8 md:p-10 text-white flex flex-col lg:flex-row justify-between items-center text-center lg:text-left gap-4">
                                <div className="flex-1"><h2 className="text-lg md:text-xl font-black mb-1">Monthly total</h2><p className="text-white/70 text-[11px] md:text-xs font-medium uppercase tracking-widest opacity-80">with Auto Pay & Paper-free billing</p></div>
                                <div className="text-right text-white">
                                    <div className="flex items-baseline justify-center md:justify-end gap-1"><span className="text-5xl md:text-6xl font-black tracking-tighter leading-none">${calculations.total.toFixed(2)}</span><span className="text-xl font-bold opacity-40">/mo</span></div>
                                    <div className="flex flex-col items-center lg:items-end mt-2"><p className="text-white text-[10px] uppercase tracking-widest font-bold opacity-60">{includeEstimatedTaxes ? 'Incl. Taxes & Surcharges' : '+ Taxes & Surcharges'}</p><p className="text-white font-black text-[11px] uppercase tracking-widest opacity-100 mt-1">Estimated ${calculations.totalWithoutAutopay.toFixed(2)} without Auto Pay</p></div>
                                </div>
                            </div>
                            
                            <div className="p-6 md:p-8 space-y-8">
                                <div>
                                    <h3 className="text-[10px] font-bold uppercase tracking-widest opacity-30 mb-6 border-b border-black/5 pb-2">Line Breakdown</h3>
                                    <div className="space-y-8">
                                        {calculations.processedLines.map(line => (
                                            <div key={line.id} className="flex flex-row gap-4 md:gap-8 items-start">
                                                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0 border border-black/5"><Icon name={getLineIconName(line.type)} size={24} className="opacity-60" /></div>
                                                <div className="flex-1 w-full text-black">
                                                    <div className="flex justify-between items-start w-full">
                                                        <div>
                                                            <h4 className="text-lg font-black leading-tight">{line.label}</h4>
                                                            {line.deviceName && <p className="text-sm font-medium mt-1 uppercase tracking-wide opacity-60">{line.deviceName}</p>}
                                                            {customerViewMode === 'detailed' ? (
                                                                <div className="mt-3 space-y-1 border-l-2 border-stone-100 pl-4 py-0.5">
                                                                    <p className="text-sm font-medium opacity-50">${line.planBase.toFixed(2)} {line.displayName}</p>
                                                                    {line.autopaySaving > 0 && <p className="text-sm text-emerald-600 font-bold">-${line.autopaySaving.toFixed(2)} Auto Pay & Paper-free Discount</p>}
                                                                    {line.mhSaving > 0 && <p className="text-sm text-emerald-600 font-bold">-${line.mhSaving.toFixed(2)} Mobile + Home Discount</p>}
                                                                    {line.isDiscounted && <p className="text-sm text-emerald-600 font-bold">-${line.connectedDiscountAmt.toFixed(2)} Connected Device Discount</p>}
                                                                    {line.devicePrice > 0 && <p className="text-sm font-medium opacity-50">{formatDollars(line.deviceMonthly)} Device Payment</p>}
                                                                    {line.perks.map(pName => <p key={pName} className="text-sm font-medium opacity-50">${getPerkCost(pName).toFixed(2)} {pName}</p>)}
                                                                    {line.adjustments.map(adj => <p key={adj.id} className={`text-sm tracking-tight ${adj.type === 'credit' ? 'text-emerald-600 font-bold' : 'opacity-50'}`}>{adj.type === 'credit' ? '-' : ''}${parseFloat(adj.amount || 0).toFixed(2)} {adj.label}</p>)}
                                                                    {line.protCost > 0 && <p className="text-sm font-medium opacity-50">${line.protCost}.00 Device protection</p>}
                                                                    {includeEstimatedTaxes && line.taxSurcharge > 0 && <p className="text-sm font-medium opacity-50">${line.taxSurcharge.toFixed(2)} Est. Taxes & Surcharges</p>}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-2 space-y-1">
                                                                    <p className="text-xs font-medium opacity-50">{line.displayName}</p>
                                                                    {line.perks.length > 0 && <p className="text-[11px] font-bold text-black/40 italic">Includes: {line.perks.join(', ')}</p>}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="text-right"><span className="font-black text-xl">${line.totalLineCost.toFixed(2)}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {(multiDeviceProtection || accountAdjustments.length > 0) && (
                                            <div className="flex flex-row gap-4 md:gap-8 items-start pt-6 border-t border-black/5 text-black">
                                                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0 border border-black/5 opacity-40"><Icon name="ShieldCheck" size={24} /></div>
                                                <div className="flex-1 w-full text-black">
                                                    <div className="flex justify-between items-start w-full">
                                                        <div>
                                                            <h4 className="text-lg font-black leading-tight">Account services</h4>
                                                            {customerViewMode === 'detailed' ? (
                                                                <div className="mt-3 space-y-1 border-l-2 border-stone-100 pl-4">
                                                                    {multiDeviceProtection && <p className="text-sm font-medium opacity-50">${calculations.vmpCost.toFixed(2)} Multi-Device Protection</p>}
                                                                    {accountAdjustments.map(adj => <p key={adj.id} className={`text-sm tracking-tight ${adj.type === 'credit' ? 'text-emerald-600 font-bold' : 'opacity-50'}`}>{adj.type === 'credit' ? '-' : ''}${parseFloat(adj.amount || 0).toFixed(2)} {adj.label}</p>)}
                                                                </div>
                                                            ) : <p className="text-xs font-medium opacity-50 mt-1 italic">Protection & Adjustments Applied</p>}
                                                        </div>
                                                        <div className="text-right"><span className="font-black text-xl">${(calculations.vmpCost + calculations.accAdjSum).toFixed(2)}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {oneTimeCredits.length > 0 && (
                                            <div className="flex flex-row gap-4 md:gap-8 items-start pt-6 border-t border-black/5 text-black">
                                                <div className="w-10 h-10 rounded-xl bg-stone-100 flex items-center justify-center shrink-0 border border-black/5 opacity-40"><Icon name={oneTimeDisplayIcon} size={24} /></div>
                                                <div className="flex-1 w-full text-black">
                                                    <div className="flex justify-between items-start w-full">
                                                        <div>
                                                            <h4 className="text-lg font-black leading-tight">{oneTimeDisplayLabel}</h4>
                                                            {customerViewMode === 'detailed' ? (
                                                                <div className="mt-3 space-y-1 border-l-2 border-stone-100 pl-4">
                                                                    {oneTimeCredits.map(item => (
                                                                        <p key={item.id} className={`text-sm tracking-tight ${getOneTimeItemType(item) === 'credit' ? 'text-emerald-600 font-bold' : 'opacity-50'}`}>
                                                                            {getOneTimeItemType(item) === 'credit' ? '-' : ''}${parseFloat(item.amount || 0).toFixed(2)} {item.label || (getOneTimeItemType(item) === 'credit' ? 'Credit' : 'Charge')}
                                                                        </p>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <p className="text-xs font-medium opacity-50 mt-1 italic">{oneTimeDisplayLabel} applied</p>
                                                            )}
                                                        </div>
                                                        <div className="text-right"><span className={`font-black text-xl ${calculations.totalOneTimeNet < 0 ? 'text-emerald-600' : 'text-black'}`}>{oneTimeDisplayTotal(calculations.totalOneTimeNet)}</span></div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="flex flex-col-reverse sm:flex-row justify-between items-stretch sm:items-end gap-4 mt-8">
                                    <div className="flex gap-1 p-1 bg-black/5 rounded-xl h-fit self-start">
                                        <button onClick={() => setCustomerViewMode('detailed')} className={`px-3 md:px-4 py-1.5 rounded-lg text-[9px] md:text-[10px] font-bold uppercase transition-all ${customerViewMode === 'detailed' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Detailed</button>
                                        <button onClick={() => setCustomerViewMode('simple')} className={`px-3 md:px-4 py-1.5 rounded-lg text-[9px] md:text-[10px] font-bold uppercase transition-all ${customerViewMode === 'simple' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Simple</button>
                                    </div>

                                    <div className="flex flex-row flex-wrap justify-end gap-2 w-full sm:w-auto">
                                        {calculations.totalFullDeviceSavings > 0 && (
                                            <div className="p-2 sm:p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 sm:gap-3 text-emerald-950 shadow-sm flex-none w-[31%] min-w-[96px] max-w-[120px] sm:w-auto sm:max-w-[180px] md:max-w-xs overflow-hidden">
                                                <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0 text-white"><Icon name="Smartphone" size={14} /></div>
                                                <div className="min-w-0 flex-1 text-center sm:text-right"><p className="text-[clamp(7px,2vw,9px)] md:text-[10px] font-black uppercase opacity-60 leading-tight mb-0.5">Device Savings</p><span className="block whitespace-nowrap text-[clamp(10px,3.2vw,20px)] md:text-2xl font-black text-emerald-600 tracking-tight leading-none">{formatRoundedDollars(calculations.totalFullDeviceSavings)}</span></div>
                                            </div>
                                        )}
                                        <div className="p-2 sm:p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 sm:gap-3 text-emerald-950 shadow-sm flex-none w-[31%] min-w-[96px] max-w-[120px] sm:w-auto sm:max-w-[180px] md:max-w-xs overflow-hidden">
                                            <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0 text-white"><Icon name="DollarSign" size={16} /></div>
                                            <div className="min-w-0 flex-1 text-center sm:text-right"><p className="text-[clamp(7px,2vw,9px)] md:text-[10px] font-black uppercase opacity-60 leading-tight mb-0.5">Monthly Savings</p><span className="block whitespace-nowrap text-[clamp(10px,3.2vw,20px)] md:text-2xl font-black text-emerald-600 tracking-tight leading-none">{formatRoundedDollars(calculations.totalMonthlySavings)}</span></div>
                                        </div>
                                        {calculations.totalOneTimeCredits > 0 && (
                                            <div className="p-2 sm:p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 sm:gap-3 text-emerald-950 shadow-sm flex-none w-[31%] min-w-[96px] max-w-[120px] sm:w-auto sm:max-w-[180px] md:max-w-xs overflow-hidden">
                                                <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shrink-0 text-white"><Icon name={oneTimeDisplayIcon} size={16} /></div>
                                                <div className="min-w-0 flex-1 text-center sm:text-right"><p className="text-[clamp(7px,2vw,9px)] md:text-[10px] font-black uppercase opacity-60 leading-tight mb-0.5">One-Time Credits</p><span className="block whitespace-nowrap text-[clamp(10px,3.2vw,20px)] md:text-2xl font-black text-emerald-600 tracking-tight leading-none">{formatRoundedDollars(calculations.totalOneTimeCredits)}</span></div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                            
                            <div className="p-8 bg-stone-50 border-t border-black/5 flex items-start gap-2"><span className="text-[10px] font-medium opacity-40 shrink-0 mt-0.5">*</span><p className="text-[10px] font-medium leading-relaxed opacity-40 italic">{includeEstimatedTaxes ? 'Estimate only. Activation fees not included. Promotions may change. Quote guaranteed for today.' : 'Estimate only. Taxes, surcharges, and activation fees not included. Promotions may change. Quote guaranteed for today.'}</p></div>
                        </div>
                        <div className="text-center"><button onClick={() => setView('rep')} className="text-black font-bold text-[10px] uppercase tracking-widest opacity-20 hover:opacity-60 transition-all">Back to builder</button></div>
                    </div>
                )}

                {view === 'print' && (
                    /* TRUE REACT HTML PAGINATION - 1:1 PDF PARITY */
                    <div className="w-full flex flex-col items-center bg-stone-200/80 pt-4 md:pt-8 pb-24 min-h-screen gap-8 overflow-x-hidden">
                        
                        {paginatedContent.map((page, index) => (
                            <div key={index} style={{ width: 850 * scale, height: 1100 * scale }} className="relative shadow-2xl bg-white border border-black/10 transition-all duration-300 shrink-0">
                                <div id={`pdf-page-render-${index}`} style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: 850, height: 1100 }} className="absolute top-0 left-0 bg-white pt-[50px] px-[50px] pb-[40px] text-black">
                                    
                                    {/* HEADER (Only on Page 1) */}
                                    {page.isFirst && (
                                        <>
                                            <header className="text-center space-y-2 mb-10">
                                                <h1 className="text-3xl font-black text-black tracking-tight leading-none">{customerName.trim() ? <>Hey {customerName.trim().split(' ')[0]},<br />Here's Your Verizon Quote.</> : "Your Verizon Quote."}</h1>
                                                <p className="text-sm text-black/60 font-medium italic">Reliable, clear, and built for you.</p>
                                            </header>

                                            <div className="border-b-4 border-black pb-6 flex justify-between items-end mb-8">
                                                <div>
                                                    <h2 className="text-xl font-black mb-1">Monthly total</h2>
                                                    <p className="text-black/70 text-xs font-medium uppercase tracking-widest">with Auto Pay & Paper-free billing</p>
                                                </div>
                                                <div className="text-right">
                                                    <div className="flex items-baseline justify-end gap-1 mb-1">
                                                        <span className="text-[52px] font-black tracking-tight leading-[1]">${calculations.total.toFixed(2)}</span>
                                                        <span className="text-lg font-bold opacity-60">/mo</span>
                                                    </div>
                                                    <div className="flex flex-col items-end mt-4">
                                                        <p className="text-[10px] uppercase tracking-widest font-bold opacity-60 pt-1">{includeEstimatedTaxes ? 'Incl. Taxes & Surcharges' : '+ Taxes & Surcharges'}</p>
                                                        <p className="font-black text-[11px] uppercase tracking-widest mt-1">Estimated ${calculations.totalWithoutAutopay.toFixed(2)} without Auto Pay</p>
                                                    </div>
                                                </div>
                                            </div>
                                            <h3 className="text-xs font-bold uppercase tracking-widest opacity-60 mb-4 border-b border-black/20 pb-2">Line Breakdown</h3>
                                        </>
                                    )}

                                    {/* PAGE ITEMS (Lines, Acc Services, OTC, Footer) */}
                                    <div className="space-y-4">
                                        {page.items.map((item, i) => {
                                            if (item.type === 'line') {
                                                const line = item.data;
                                                return (
                                                    <div key={line.id} className="flex gap-4 items-start mb-4">
                                                        <div className="w-8 h-8 flex items-center justify-center shrink-0">
                                                            <Icon name={getLineIconName(line.type)} size={24} className="opacity-60" />
                                                        </div>
                                                        <div className="flex-1 border-b border-black/5 pb-4">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h4 className="text-sm font-black leading-tight">{line.label}</h4>
                                                                    {line.deviceName && <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{line.deviceName}</p>}
                                                                    {customerViewMode === 'detailed' ? (
                                                                        <div className="mt-1.5 space-y-0.5 border-l-2 border-black/10 pl-3 py-0.5">
                                                                            <p className="text-xs font-medium opacity-80">${line.planBase.toFixed(2)} {line.displayName}</p>
                                                                            {line.autopaySaving > 0 && <p className="text-xs text-black font-semibold opacity-80">-${line.autopaySaving.toFixed(2)} Auto Pay & Paper-free Discount</p>}
                                                                            {line.mhSaving > 0 && <p className="text-xs text-black font-semibold opacity-80">-${line.mhSaving.toFixed(2)} Mobile + Home Discount</p>}
                                                                            {line.isDiscounted && <p className="text-xs text-black font-semibold opacity-80">-${line.connectedDiscountAmt.toFixed(2)} Connected Device Discount</p>}
                                                                            {line.devicePrice > 0 && <p className="text-xs font-medium opacity-80">{formatDollars(line.deviceMonthly)} Device Payment</p>}
                                                                            {line.perks.map(pName => <p key={pName} className="text-xs font-medium opacity-80">${getPerkCost(pName).toFixed(2)} {pName}</p>)}
                                                                            {line.adjustments.map(adj => <p key={adj.id} className={`text-xs tracking-tight ${adj.type === 'credit' ? 'text-black font-semibold opacity-80' : 'opacity-80'}`}>{adj.type === 'credit' ? '-' : ''}${parseFloat(adj.amount || 0).toFixed(2)} {adj.label}</p>)}
                                                                            {line.protCost > 0 && <p className="text-xs font-medium opacity-80">${line.protCost}.00 Device protection</p>}
                                                                            {includeEstimatedTaxes && line.taxSurcharge > 0 && <p className="text-xs font-medium opacity-80">${line.taxSurcharge.toFixed(2)} Est. Taxes & Surcharges</p>}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="mt-1 space-y-0.5">
                                                                            <p className="text-[10px] font-medium opacity-80">{line.displayName}</p>
                                                                            {line.perks.length > 0 && <p className="text-[9px] font-bold text-black/60 italic">Includes: {line.perks.join(', ')}</p>}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                                <div className="text-right">
                                                                    <span className="font-black text-base">${line.totalLineCost.toFixed(2)}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            
                                            if (item.type === 'account_services') {
                                                return (
                                                    <div key={`acc-serv-${i}`} className="flex gap-4 items-start pt-2 mb-4">
                                                        <div className="w-8 h-8 flex items-center justify-center shrink-0 opacity-60">
                                                            <Icon name="ShieldCheck" size={24}/>
                                                        </div>
                                                        <div className="flex-1 border-b border-black/5 pb-4">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h4 className="text-sm font-black leading-tight">Account services</h4>
                                                                    {customerViewMode === 'detailed' ? (
                                                                        <div className="mt-1.5 space-y-0.5 border-l-2 border-black/10 pl-3 py-0.5">
                                                                            {multiDeviceProtection && <p className="text-xs font-medium opacity-80">${calculations.vmpCost.toFixed(2)} Multi-Device Protection</p>}
                                                                            {accountAdjustments.map(adj => <p key={adj.id} className={`text-xs tracking-tight ${adj.type === 'credit' ? 'text-black font-semibold opacity-80' : 'opacity-80'}`}>{adj.type === 'credit' ? '-' : ''}${parseFloat(adj.amount || 0).toFixed(2)} {adj.label}</p>)}
                                                                        </div>
                                                                    ) : <p className="text-[10px] font-medium opacity-80 mt-0.5 italic">Protection & Adjustments Applied</p>}
                                                                </div>
                                                                <div className="text-right"><span className="font-black text-base">${(calculations.vmpCost + calculations.accAdjSum).toFixed(2)}</span></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (item.type === 'otc') {
                                                return (
                                                    <div key={`otc-${i}`} className="flex gap-4 items-start pt-2 mb-4">
                                                        <div className="w-8 h-8 flex items-center justify-center shrink-0 opacity-60">
                                                            <Icon name={oneTimeDisplayIcon} size={24}/>
                                                        </div>
                                                        <div className="flex-1 border-b border-black/5 pb-4">
                                                            <div className="flex justify-between items-start">
                                                                <div>
                                                                    <h4 className="text-sm font-black leading-tight">{oneTimeDisplayLabel}</h4>
                                                                    {customerViewMode === 'detailed' ? (
                                                                        <div className="mt-1.5 space-y-0.5 border-l-2 border-black/10 pl-3 py-0.5">
                                                                            {oneTimeCredits.map(item => (
                                                                                <p key={item.id} className="text-xs tracking-tight text-black font-semibold opacity-80">
                                                                                    {getOneTimeItemType(item) === 'credit' ? '-' : ''}${parseFloat(item.amount || 0).toFixed(2)} {item.label || (getOneTimeItemType(item) === 'credit' ? 'Credit' : 'Charge')}
                                                                                </p>
                                                                            ))}
                                                                        </div>
                                                                    ) : (
                                                                        <p className="text-[10px] font-medium opacity-80 mt-0.5 italic">{oneTimeDisplayLabel} applied</p>
                                                                    )}
                                                                </div>
                                                                <div className="text-right"><span className="font-black text-base text-black">{oneTimeDisplayTotal(calculations.totalOneTimeNet)}</span></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }

                                            if (item.type === 'footer') {
                                                return (
                                                    <div key={`footer-${i}`}>
                                                        <div className="flex justify-end gap-6 pt-4 border-t border-black/20">
                                                            {calculations.totalFullDeviceSavings > 0 && (
                                                                <div className="text-right">
                                                                    <p className="text-[9px] font-black uppercase opacity-60 leading-none mb-1 text-black">Device Savings</p>
                                                                    <span className="text-lg font-black text-black tracking-tighter leading-none">{formatRoundedDollars(calculations.totalFullDeviceSavings)}</span>
                                                                </div>
                                                            )}
                                                            <div className="text-right">
                                                                <p className="text-[9px] font-black uppercase opacity-60 leading-none mb-1 text-black">Monthly Savings</p>
                                                                <span className="text-lg font-black text-black tracking-tighter leading-none">{formatRoundedDollars(calculations.totalMonthlySavings)}</span>
                                                            </div>
                                                            {calculations.totalOneTimeCredits > 0 && (
                                                                <div className="text-right">
                                                                    <p className="text-[9px] font-black uppercase opacity-60 leading-none mb-1 text-black">One-Time Credits</p>
                                                                    <span className="text-lg font-black text-black tracking-tighter leading-none">{formatRoundedDollars(calculations.totalOneTimeCredits)}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                        
                                                        <div className="mt-12 flex items-start gap-2 opacity-60 border-t border-black/10 pt-4">
                                                            <span className="text-[9px] font-medium shrink-0 mt-0.5">*</span>
                                                            <p className="text-[9px] font-medium leading-relaxed italic">{includeEstimatedTaxes ? 'Estimate only. Activation fees not included. Promotions may change. Quote guaranteed for today.' : 'Estimate only. Taxes, surcharges, and activation fees not included. Promotions may change. Quote guaranteed for today.'}</p>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>

                                    {/* Baked in page number logic for the preview */}
                                    <div className="absolute bottom-6 right-10 text-xs font-bold text-black/40">
                                        Page {index + 1} of {paginatedContent.length}
                                    </div>
                                </div>
                            </div>
                        ))}

                        {/* Bottom Action Buttons */}
                        <div className="mt-4 flex flex-col items-center gap-4 relative z-10">
                            <button onClick={handleSavePdf} disabled={isGeneratingPdf} className="px-8 py-4 bg-black hover:bg-stone-800 text-white rounded-xl font-black text-lg transition-all shadow-xl flex items-center gap-3">
                                {isGeneratingPdf ? <Icon name="Loader2" size={20} className="animate-spin" /> : <Icon name="Download" size={20}/>}
                                {isGeneratingPdf ? 'Generating PDF...' : 'Save as PDF'}
                            </button>
                            <button onClick={() => setView('customer')} className="text-black font-bold text-xs uppercase tracking-widest opacity-40 hover:opacity-100 transition-all flex items-center gap-2 mb-8">
                                <Icon name="ArrowLeft" size={14}/> Back to quote
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Modals remain exactly as before */}
            {activeHardwareLineId && activeHardwareLine && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={closeHardwareModal}>
                    <div className="relative w-full max-w-md bg-white rounded-[32px] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-black/5 bg-stone-50 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <h2 className="text-xl font-black leading-none">Hardware settings.</h2>
                            </div>
                            <button onClick={closeHardwareModal} className="p-2 hover:bg-black/5 rounded-full"><Icon name="X" size={24}/></button>
                        </div>
                        <div className="p-8 space-y-6">
                            {hardwareMode === 'catalog' && (
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Select manufacturer</label>
                                        <select value={selectedDeviceManufacturer} onChange={e => handleDeviceManufacturerChange(e.target.value)} className="w-full px-5 py-5 bg-stone-50 border border-black/10 rounded-2xl outline-none font-bold text-lg focus:border-black text-black">
                                            <option value="">Choose manufacturer</option>
                                            {deviceManufacturers.map(manufacturer => <option key={manufacturer} value={manufacturer}>{manufacturer}</option>)}
                                        </select>
                                    </div>

                                    {selectedDeviceManufacturer && (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Select model</label>
                                            <select value={selectedDeviceModel} onChange={e => handleDeviceModelChange(e.target.value)} className="w-full px-5 py-5 bg-stone-50 border border-black/10 rounded-2xl outline-none font-bold text-lg focus:border-black text-black">
                                                <option value="">Choose model</option>
                                                {deviceModels.map(model => <option key={model} value={model}>{model}</option>)}
                                            </select>
                                        </div>
                                    )}

                                    {selectedDeviceModel && storageOptions.length > 1 && (
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Select storage</label>
                                            <select value={selectedDeviceStorage} onChange={e => handleDeviceStorageChange(e.target.value)} className="w-full px-5 py-5 bg-stone-50 border border-black/10 rounded-2xl outline-none font-bold text-lg focus:border-black text-black">
                                                <option value="">Choose storage</option>
                                                {storageOptions.map(storage => <option key={storage} value={storage}>{storage}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            )}

                            {hardwareMode === 'custom' && (
                                <>
                                    <div className="flex items-center justify-between gap-3">
                                        <button onClick={openDevicePicker} disabled={deviceManufacturers.length === 0} className={`px-4 py-2 rounded-full text-[10px] font-bold uppercase transition-all flex items-center gap-2 ${deviceManufacturers.length === 0 ? 'bg-stone-100 text-black/25 cursor-not-allowed' : 'bg-stone-50 text-black/60 border border-black/10 hover:bg-black hover:text-white'}`}><Icon name="Search" size={13} /> Select device</button>
                                        <div className="flex gap-1 p-1 bg-black/5 rounded-full">
                                            <button onClick={() => setHardwareAmountMode('total')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${hardwareAmountMode === 'total' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Total</button>
                                            <button onClick={() => setHardwareAmountMode('monthly')} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${hardwareAmountMode === 'monthly' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Monthly</button>
                                        </div>
                                    </div>
                                    <div className="space-y-2"><label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Device name</label><input value={activeHardwareLine.deviceName} onFocus={e => e.target.select()} onChange={e => updateLine(activeHardwareLineId, { deviceName: e.target.value })} placeholder="e.g. iPhone 16 Pro" className="w-full px-5 py-4 bg-stone-50 border border-black/10 rounded-2xl outline-none font-bold text-lg focus:border-black text-black" /></div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-3"><label className="text-[11px] font-bold uppercase tracking-widest opacity-40">{hardwareAmountMode === 'monthly' ? 'Monthly payment' : 'Financed amount'}</label><input type="number" inputMode="decimal" onWheel={e => e.currentTarget.blur()} value={hardwareAmountInputs.devicePrice} onFocus={e => e.target.select()} onChange={e => updateHardwareAmount('devicePrice', e.target.value)} placeholder="0.00" className="w-full px-6 py-5 bg-stone-50 border border-black/10 rounded-2xl font-bold text-lg outline-none focus:border-black text-black" /></div>
                                        <div className="space-y-3 text-black">
                                            <div className="flex gap-1 p-1 bg-black/5 rounded-full w-fit">
                                                <button onClick={() => setPromoMode('credit')} className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${hardwarePromoMode === 'credit' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>{hardwareAmountMode === 'monthly' ? 'Monthly credit' : 'Promo credit'}</button>
                                                <button onClick={() => setPromoMode('free')} className={`px-3 py-1 rounded-full text-[9px] font-bold uppercase transition-all ${hardwarePromoMode === 'free' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Free</button>
                                            </div>
                                            <input type="number" inputMode="decimal" disabled={hardwarePromoMode === 'free'} onWheel={e => e.currentTarget.blur()} value={hardwareAmountInputs.promoCredit} onFocus={e => e.target.select()} onChange={e => updateHardwareAmount('promoCredit', e.target.value)} placeholder="0.00" className={`w-full px-6 py-5 bg-stone-50 border border-black/10 rounded-2xl font-bold text-lg text-verizon-red outline-none focus:border-red-500 text-black ${hardwarePromoMode === 'free' ? 'opacity-60 cursor-not-allowed' : ''}`} />
                                        </div>
                                    </div>
                                    <div className="p-8 bg-black text-white rounded-[28px] flex justify-between items-center shadow-xl text-white"><div><p className="text-[11px] font-bold opacity-60">Net monthly</p><p className="text-4xl font-black tracking-tight">{formatDollars(((parseFloat(activeHardwareLine.devicePrice) || 0) - (parseFloat(activeHardwareLine.promoCredit) || 0))/FINANCING_MONTHS)}</p></div><div className="text-right text-xs font-bold opacity-60 uppercase tracking-widest">{FINANCING_MONTHS} Months</div></div>
                                </>
                            )}
                        </div>
                        <div className="p-8 border-t border-black/5 text-black"><button onClick={closeHardwareModal} className="w-full py-6 bg-black text-white rounded-2xl font-black text-xl hover:scale-[1.01] active:scale-95 transition-all shadow-lg text-white">Done</button></div>
                    </div>
                </div>
            )}

            {activeCustomTaxLineId && activeCustomTaxLine && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setActiveCustomTaxLineId(null)}>
                    <div className="relative w-full max-w-md bg-white rounded-[32px] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-black/5 bg-stone-50 flex justify-between items-center"><h2 className="text-xl font-black leading-none">Taxes/Sur.</h2><button onClick={() => setActiveCustomTaxLineId(null)} className="p-2 hover:bg-black/5 rounded-full"><Icon name="X" size={24}/></button></div>
                        <div className="p-8">
                            <div className="space-y-3 text-black"><label className="text-[11px] font-bold uppercase tracking-widest opacity-40">Monthly tax/surcharge</label><div className="relative"><span className="absolute left-6 top-1/2 -translate-y-1/2 text-lg font-bold opacity-40">$</span><input type="number" inputMode="decimal" step="0.01" onWheel={e => e.currentTarget.blur()} value={activeCustomTaxLine.customTaxSurcharge || ''} onFocus={e => e.target.select()} onChange={e => updateLine(activeCustomTaxLineId, { customTaxSurcharge: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full pl-10 pr-6 py-5 bg-stone-50 border border-black/10 rounded-2xl font-bold text-lg outline-none focus:border-black text-black" /></div></div>
                        </div>
                        <div className="p-8 border-t border-black/5 text-black"><button onClick={() => setActiveCustomTaxLineId(null)} className="w-full py-6 bg-black text-white rounded-2xl font-black text-xl hover:scale-[1.01] active:scale-95 transition-all shadow-lg text-white">Done</button></div>
                    </div>
                </div>
            )}

            {activeCustomProtectionLineId && activeCustomProtectionLine && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setActiveCustomProtectionLineId(null)}>
                    <div className="relative w-full max-w-md bg-white rounded-[32px] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-8 border-b border-black/5 bg-stone-50 flex justify-between items-center"><h2 className="text-xl font-black leading-none">Protection cost.</h2><button onClick={() => setActiveCustomProtectionLineId(null)} className="p-2 hover:bg-black/5 rounded-full"><Icon name="X" size={24}/></button></div>
                        <div className="p-8 space-y-6">
                            <div className="space-y-3 text-black"><label className="text-[11px] font-bold uppercase tracking-widest opacity-40">Monthly protection</label><input type="number" inputMode="decimal" onWheel={e => e.currentTarget.blur()} value={activeCustomProtectionLine.customProtectionCost || ''} onFocus={e => e.target.select()} onChange={e => updateLine(activeCustomProtectionLineId, { customProtectionCost: parseFloat(e.target.value) || 0 })} placeholder="0.00" className="w-full px-6 py-5 bg-stone-50 border border-black/10 rounded-2xl font-bold text-lg outline-none focus:border-black text-black" /></div>
                            <div className="p-8 bg-black text-white rounded-[28px] flex justify-between items-center shadow-xl text-white"><div><p className="text-[11px] font-bold opacity-60">Protection</p><p className="text-4xl font-black tracking-tight">${parseFloat(activeCustomProtectionLine.customProtectionCost || 0).toFixed(2)}</p></div><div className="text-right text-xs font-bold opacity-60 uppercase tracking-widest">Monthly</div></div>
                        </div>
                        <div className="p-8 border-t border-black/5 text-black"><button onClick={() => setActiveCustomProtectionLineId(null)} className="w-full py-6 bg-black text-white rounded-2xl font-black text-xl hover:scale-[1.01] active:scale-95 transition-all shadow-lg text-white">Done</button></div>
                    </div>
                </div>
            )}

            {(activeAdjLineId || showAccountAdj) && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => { setActiveAdjLineId(null); setShowAccountAdj(false); }}>
                    <div className="relative w-full max-w-lg bg-white rounded-[40px] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-10 border-b border-black/5 bg-stone-50 flex justify-between items-center"><h2 className="text-2xl font-black">{showAccountAdj ? 'Account Adjustments' : 'Line Adjustments'}</h2><button onClick={() => { setActiveAdjLineId(null); setShowAccountAdj(false); }} className="p-3 hover:bg-black/5 rounded-full"><Icon name="X" size={28}/></button></div>
                        <div className="p-10 space-y-6 max-h-[60vh] overflow-y-auto">
                            {(showAccountAdj ? accountAdjustments : lines.find(l => l.id === activeAdjLineId)?.adjustments || []).map((adj, i) => (
                                <div key={adj.id} className="flex flex-col gap-4 bg-stone-50 p-6 rounded-3xl border border-black/5 text-black">
                                    <div className="flex gap-2 p-1 bg-black/5 rounded-xl self-start"><button onClick={() => updateAdjustment(i, { type: 'credit' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${adj.type === 'credit' ? 'bg-emerald-500 text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Credit</button><button onClick={() => updateAdjustment(i, { type: 'charge' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${adj.type === 'charge' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Charge</button></div>
                                    <div className="flex gap-4 items-end text-black"><div className="flex-grow space-y-1"><label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Label</label><input value={adj.label} onFocus={e => e.target.select()} placeholder="Adjustment Label" onChange={e => updateAdjustment(i, { label: e.target.value })} className="w-full bg-white border border-black/10 px-4 py-3 rounded-xl text-sm font-bold focus:border-black outline-none text-black" /></div><div className="w-28 space-y-1"><label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Amount</label><input type="number" inputMode="decimal" value={adj.amount} onWheel={e => e.currentTarget.blur()} onFocus={e => e.target.select()} placeholder="0.00" onChange={e => updateAdjustment(i, { amount: e.target.value })} className="w-full bg-white border border-black/10 px-4 py-3 rounded-xl text-sm font-bold focus:border-black outline-none text-black" /></div><button onClick={() => removeAdjustment(i)} className="p-3 text-verizon-red hover:bg-red-50 rounded-lg transition-colors"><Icon name="Trash2" size={20}/></button></div>
                                </div>
                            ))}
                            <button onClick={addAdjustment} className="w-full py-6 border-2 border-dashed border-black/10 rounded-2xl text-black/40 hover:text-black font-bold flex items-center justify-center gap-3 transition-all text-base uppercase"><Icon name="PlusCircle" size={20}/> Add adjustment</button>
                        </div>
                        <div className="p-8 border-t border-black/5 text-black"><button onClick={() => { setActiveAdjLineId(null); setShowAccountAdj(false); }} className="w-full py-6 bg-black text-white rounded-2xl font-black text-xl hover:scale-[1.01] active:scale-95 transition-all shadow-md text-white">Done</button></div>
                    </div>
                </div>
            )}

            {activePerkLineId && lines.find(l => l.id === activePerkLineId) && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setActivePerkLineId(null)}>
                    <div className="relative w-full max-w-2xl bg-white rounded-[40px] overflow-hidden shadow-2xl text-black" onClick={e => e.stopPropagation()}>
                        <div className="p-10 border-b border-black/5 bg-stone-50 flex justify-between items-center"><h2 className="text-xl font-black">Select perks.</h2><button onClick={() => setActivePerkLineId(null)} className="p-3 hover:bg-black/5 rounded-full transition-colors text-black"><Icon name="X" size={28}/></button></div>
                        <div className="p-10 max-h-[50vh] overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-5">
                            {PERKS.map(perk => {
                                const line = lines.find(l => l.id === activePerkLineId);
                                const isSel = line?.perks.includes(perk.name);
                                return (
                                    <button key={perk.name} onClick={() => togglePerk(activePerkLineId, perk.name)} className={`flex items-center justify-between p-6 rounded-3xl border-2 transition-all ${isSel ? 'border-black bg-black text-white shadow-md' : 'border-black/5 text-black hover:border-black/20 hover:bg-stone-50'}`}><div className="flex flex-col text-left"><span className={`font-bold text-lg leading-tight ${isSel ? 'text-white' : 'text-black'}`}>{perk.name}</span><span className={`text-xs font-medium mt-1 ${isSel ? 'text-white/60' : 'text-black/40'}`}>{`$${perk.cost.toFixed(2)}/mo`}</span></div>{isSel && <Icon name="CheckCircle2" size={24} className="text-yellow-300" />}</button>
                                );
                            })}
                        </div>
                        <div className="p-8 border-t border-black/5 flex justify-between items-center text-black bg-stone-50"><div><p className="text-[10px] font-bold opacity-40 uppercase tracking-widest">Total Perks</p><p className="text-3xl font-black text-black">${lines.find(l => l.id === activePerkLineId)?.perks.reduce((acc, pName) => acc + getPerkCost(pName), 0).toFixed(2)}/mo</p></div><button onClick={() => setActivePerkLineId(null)} className="px-14 py-5 bg-verizon-red text-white rounded-2xl font-black text-xl shadow-lg hover:scale-[1.01] active:scale-95 transition-all text-white">Save perks</button></div>
                    </div>
                </div>
            )}

            {showOneTimeCreditsModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowOneTimeCreditsModal(false)}>
                    <div className="relative w-full max-w-lg bg-white rounded-[40px] overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>
                        <div className="p-10 border-b border-black/5 bg-stone-50 flex justify-between items-center"><h2 className="text-2xl font-black">One-Time Charges & Credits</h2><button onClick={() => setShowOneTimeCreditsModal(false)} className="p-3 hover:bg-black/5 rounded-full"><Icon name="X" size={28}/></button></div>
                        <div className="p-10 space-y-6 max-h-[60vh] overflow-y-auto">
                            {oneTimeCredits.map((item, i) => (
                                <div key={item.id} className="flex flex-col gap-4 bg-stone-50 p-6 rounded-3xl border border-black/5 text-black">
                                    <div className="flex gap-2 p-1 bg-black/5 rounded-xl self-start"><button onClick={() => updateOneTimeCredit(i, { type: 'credit' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${getOneTimeItemType(item) === 'credit' ? 'bg-emerald-500 text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Credit</button><button onClick={() => updateOneTimeCredit(i, { type: 'charge' })} className={`px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase transition-all ${getOneTimeItemType(item) === 'charge' ? 'bg-black text-white shadow-sm' : 'text-black/40 hover:text-black'}`}>Charge</button></div>
                                    <div className="flex gap-4 items-end text-black">
                                        <div className="flex-grow space-y-1"><label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Label</label><input value={item.label} onFocus={e => e.target.select()} placeholder={getOneTimeItemType(item) === 'credit' ? 'Credit Label' : 'Charge Label'} onChange={e => updateOneTimeCredit(i, { label: e.target.value })} className="w-full bg-white border border-black/10 px-4 py-3 rounded-xl text-sm font-bold focus:border-black outline-none text-black" /></div>
                                        <div className="w-28 space-y-1"><label className="text-[10px] font-bold uppercase tracking-widest opacity-40">Amount</label><input type="number" inputMode="decimal" value={item.amount} onWheel={e => e.currentTarget.blur()} onFocus={e => e.target.select()} placeholder="0.00" onChange={e => updateOneTimeCredit(i, { amount: e.target.value })} className="w-full bg-white border border-black/10 px-4 py-3 rounded-xl text-sm font-bold focus:border-black outline-none text-black" /></div>
                                        <button onClick={() => removeOneTimeCredit(i)} className="p-3 text-verizon-red hover:bg-red-50 rounded-lg transition-colors"><Icon name="Trash2" size={20}/></button>
                                    </div>
                                </div>
                            ))}
                            <button onClick={() => setOneTimeCredits(prev => [...prev, createOneTimeCredit()])} className="w-full py-6 border-2 border-dashed border-black/10 rounded-2xl text-black/40 hover:text-black font-bold flex items-center justify-center gap-3 transition-all text-base uppercase"><Icon name="PlusCircle" size={20}/> Add one-time item</button>
                        </div>
                        <div className="p-8 border-t border-black/5 text-black"><button onClick={() => setShowOneTimeCreditsModal(false)} className="w-full py-6 bg-black text-white rounded-2xl font-black text-xl hover:scale-[1.01] active:scale-95 transition-all shadow-md text-white">Done</button></div>
                    </div>
                </div>
            )}
        </div>
    );
};

const Boot = () => {
    const [config, setConfig] = useState(null);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        loadPricingConfig()
            .then(setConfig)
            .catch(error => {
                console.error('Failed to load pricing config', error);
                setLoadError(error.message || 'Unable to load pricing config.');
            });
    }, []);

    if (loadError) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 text-black">
                <div className="max-w-md bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                    <h1 className="text-xl font-black mb-2">Pricing failed to load.</h1>
                    <p className="text-sm opacity-60 font-medium">{loadError}</p>
                </div>
            </div>
        );
    }

    if (!config) {
        return (
            <div className="min-h-screen flex items-center justify-center text-black/50 font-bold text-sm uppercase tracking-widest">
                Loading quote tool...
            </div>
        );
    }

    return <App config={config} />;
};

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<Boot />);
