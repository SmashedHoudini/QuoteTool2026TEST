/*
    Quote state helpers.

    This file creates the plain JavaScript objects the app stores in React
    state: lines, copied lines, adjustments, and one-time items. Keeping those
    object shapes here makes it easier to add fields later without hunting
    through the UI.

    These helpers do not calculate prices and do not render UI.
*/
(function () {
    // Small IDs are fine here because quotes live in browser state, not a database.
    const createId = () => Math.random().toString(36).substr(2, 9);

    const getDefaultPlanName = (type, config) => {
        if (type === 'Smartphone') return config.smartphonePlans[0].name;
        if (type === 'Tablet') return config.tabletPlans[0].name;
        if (type === 'Watch') return config.watchPlans[0].name;
        if (type === 'Home Internet') return config.homeInternetPlans[0].name;
        if (type === 'Custom') return 'Custom';
        return '';
    };

    const createLine = (type, lineNumber, config) => ({
        id: createId(),
        label: `Line ${lineNumber}`,
        type,
        customLineTypeLabel: '',
        planName: getDefaultPlanName(type, config),
        customPlanName: '',
        customPlanPrice: 0,
        customAutopayDiscount: 0,
        customDiscountSlots: 0,
        customTaxSurcharge: 0,
        customProtectionCost: 0,
        customIncludeInVmdp: false,
        deviceName: '',
        devicePrice: 0,
        promoCredit: 0,
        perks: [],
        adjustments: [],
        individualProtection: false,
    });

    const copyLine = (line, lineNumber) => ({
        ...line,
        id: createId(),
        label: `Line ${lineNumber}`,
        perks: [...line.perks],
        adjustments: line.adjustments.map(adjustment => ({
            ...adjustment,
            id: createId()
        }))
    });

    const withPlanDefaultForType = (line, updates, config) => {
        const updated = { ...line, ...updates };
        if (updates.type && updates.type !== line.type) {
            updated.planName = getDefaultPlanName(updates.type, config);
        }
        return updated;
    };

    const createAdjustment = () => ({
        id: createId(),
        label: '',
        amount: '',
        type: 'credit'
    });

    // Historical name, but the object can now be either a credit or a charge.
    // New items start as credits because that matches the original workflow.
    const createOneTimeCredit = () => ({
        id: createId(),
        label: '',
        amount: '',
        type: 'credit'
    });

    window.QuoteTool = {
        ...(window.QuoteTool || {}),
        createId,
        createLine,
        copyLine,
        withPlanDefaultForType,
        createAdjustment,
        createOneTimeCredit
    };
})();
