/*
    Quote math lives here.

    This file takes the raw quote state from app.js plus the editable pricing
    data from pricing.json and turns it into totals the UI can display. It does
    not render anything and should stay as close to a pure calculator as we can
    keep it.

    Be careful in here: small changes can affect every monthly total, discount,
    savings number, and PDF/customer view.
*/
(function () {
    const requiredNumber = (value, label) => {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            throw new Error(`pricing.json is missing a number for ${label}.`);
        }
        return value;
    };

    const requiredArray = (value, label) => {
        if (!Array.isArray(value)) {
            throw new Error(`pricing.json is missing an array for ${label}.`);
        }
        return value;
    };

    const requiredObject = (value, label) => {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new Error(`pricing.json is missing an object for ${label}.`);
        }
        return value;
    };

    const validatePricingConfig = (config) => {
        requiredArray(config.smartphonePlans, 'smartphonePlans').forEach((plan, index) => {
            requiredArray(plan.costs, `smartphonePlans[${index}].costs`);
            requiredNumber(plan.autopay, `smartphonePlans[${index}].autopay`);
        });
        requiredArray(config.tabletPlans, 'tabletPlans').forEach((plan, index) => {
            requiredNumber(plan.price, `tabletPlans[${index}].price`);
        });
        requiredArray(config.watchPlans, 'watchPlans').forEach((plan, index) => {
            requiredNumber(plan.price, `watchPlans[${index}].price`);
        });
        requiredArray(config.homeInternetPlans, 'homeInternetPlans').forEach((plan, index) => {
            requiredNumber(plan.price, `homeInternetPlans[${index}].price`);
            requiredNumber(plan.autopay, `homeInternetPlans[${index}].autopay`);
            requiredNumber(plan.mhDiscount, `homeInternetPlans[${index}].mhDiscount`);
        });
        requiredArray(config.perks, 'perks').forEach((perk, index) => {
            requiredNumber(perk.cost, `perks[${index}].cost`);
            requiredNumber(perk.savings, `perks[${index}].savings`);
        });

        const settings = requiredObject(config.quoteSettings, 'quoteSettings');
        requiredNumber(settings.financingMonths, 'quoteSettings.financingMonths');
        requiredNumber(settings.connectedDeviceDiscountRate, 'quoteSettings.connectedDeviceDiscountRate');

        const taxSettings = requiredObject(settings['taxes&surcharges'], 'quoteSettings.taxes&surcharges');
        requiredNumber(taxSettings.Smartphone, 'quoteSettings.taxes&surcharges.Smartphone');
        requiredNumber(taxSettings.Tablet, 'quoteSettings.taxes&surcharges.Tablet');
        requiredNumber(taxSettings.Watch, 'quoteSettings.taxes&surcharges.Watch');
        requiredNumber(taxSettings['Home Internet'], 'quoteSettings.taxes&surcharges.Home Internet');
        requiredNumber(taxSettings.Custom, 'quoteSettings.taxes&surcharges.Custom');

        const individualProtection = requiredObject(settings.individualProtection, 'quoteSettings.individualProtection');
        requiredNumber(individualProtection.Smartphone, 'quoteSettings.individualProtection.Smartphone');
        requiredNumber(individualProtection.Watch, 'quoteSettings.individualProtection.Watch');
        requiredNumber(individualProtection.Tablet, 'quoteSettings.individualProtection.Tablet');

        const multiProtection = requiredObject(settings.multiDeviceProtection, 'quoteSettings.multiDeviceProtection');
        requiredNumber(multiProtection.perLine, 'quoteSettings.multiDeviceProtection.perLine');
        requiredNumber(multiProtection.monthlyCap, 'quoteSettings.multiDeviceProtection.monthlyCap');

        return config;
    };

    const parseAmount = (value) => parseFloat(value) || 0;

    const findByName = (items, name, label) => {
        const item = items.find(candidate => candidate.name === name);
        if (!item) {
            throw new Error(`Could not find "${name}" in pricing.json ${label}.`);
        }
        return item;
    };

    const sumAdjustments = (adjustments) => adjustments.reduce((acc, adjustment) => {
        const amount = parseAmount(adjustment.amount);
        return acc + (adjustment.type === 'credit' ? -amount : amount);
    }, 0);

    const getTaxSurchargeForLine = (line, taxSettings) => {
        if (line.type === 'Custom') return parseAmount(line.customTaxSurcharge ?? taxSettings.Custom);
        return parseAmount(taxSettings[line.type]);
    };

    const calculateQuote = ({ lines, multiDeviceProtection, accountAdjustments, oneTimeCredits, includeEstimatedTaxes }, config) => {
        const SMARTPHONE_PLANS = config.smartphonePlans;
        const TABLET_PLANS = config.tabletPlans;
        const WATCH_PLANS = config.watchPlans;
        const HOME_INTERNET_PLANS = config.homeInternetPlans;
        const PERKS = config.perks;
        const settings = config.quoteSettings;
        const financingMonths = settings.financingMonths;
        const connectedDeviceDiscountRate = settings.connectedDeviceDiscountRate;
        const taxSettings = settings['taxes&surcharges'];
        const individualProtection = settings.individualProtection;
        const multiProtection = settings.multiDeviceProtection;

        // Phone count drives Verizon's smartphone pricing tier. Four or more
        // lines use the last price in each plan's costs array.
        const spLines = lines.filter(line => line.type === 'Smartphone');
        const pricingTier = Math.max(spLines.length - 1, 0);
        let totalSlots = 0;

        // Some phone plans unlock half-off connected devices. We collect the
        // available slots first, then spend them on tablets/watches below.
        spLines.forEach(line => {
            if (line.planName === 'Custom') {
                totalSlots += (parseInt(line.customDiscountSlots) || 0);
            } else {
                const plan = findByName(SMARTPHONE_PLANS, line.planName, 'smartphonePlans');
                if (plan?.discountSlots) totalSlots += plan.discountSlots;
            }
        });

        // First pass: price each line by itself. Account-level discounts and
        // connected-device slots are easier to reason about after this.
        const baseProcessed = lines.map(line => {
            let planBase = 0;
            let autopaySaving = 0;
            let mhSaving = 0;
            let displayName = line.planName;
            let typeName = line.type;

            if (line.type === 'Custom') typeName = line.customLineTypeLabel || 'Custom Device';

            if (line.planName === 'Custom') {
                planBase = parseAmount(line.customPlanPrice);
                autopaySaving = parseAmount(line.customAutopayDiscount);
                displayName = line.customPlanName || 'Custom Plan';
            } else if (line.type === 'Smartphone') {
                const plan = findByName(SMARTPHONE_PLANS, line.planName, 'smartphonePlans');
                planBase = plan.costs[Math.min(pricingTier, plan.costs.length - 1)];
                autopaySaving = plan.autopay;
            } else if (line.type === 'Home Internet') {
                const plan = findByName(HOME_INTERNET_PLANS, line.planName, 'homeInternetPlans');
                planBase = plan.price;
                autopaySaving = plan.autopay;
                if (spLines.length > 0) mhSaving = plan.mhDiscount;
            } else if (line.type === 'Tablet') {
                const plan = findByName(TABLET_PLANS, line.planName, 'tabletPlans');
                planBase = plan.price;
            } else if (line.type === 'Watch') {
                const plan = findByName(WATCH_PLANS, line.planName, 'watchPlans');
                planBase = plan.price;
            }

            const perkCost = line.perks.reduce((acc, name) => acc + findByName(PERKS, name, 'perks').cost, 0);
            const perkSavings = line.perks.reduce((acc, name) => acc + findByName(PERKS, name, 'perks').savings, 0);
            const adjSum = sumAdjustments(line.adjustments);

            let protCost = 0;
            if (!multiDeviceProtection && line.type !== 'Home Internet') {
                if (line.type === 'Custom') {
                    protCost = parseAmount(line.customProtectionCost);
                } else if (line.individualProtection) {
                    protCost = individualProtection[line.type];
                }
            }

            const deviceMonthly = (parseAmount(line.devicePrice) / financingMonths) - (parseAmount(line.promoCredit) / financingMonths);
            const monthlyPromoCredit = parseAmount(line.promoCredit) / financingMonths;
            const taxSurcharge = getTaxSurchargeForLine(line, taxSettings);

            return {
                ...line,
                typeName,
                planBase,
                autopaySaving,
                mhSaving,
                displayName,
                perkCost,
                perkSavings,
                protCost,
                deviceMonthly,
                adjSum,
                taxSurcharge,
                monthlyPromoCredit,
                finalPlan: planBase - autopaySaving - mhSaving
            };
        });

        // Second pass: apply connected-device slots in line order, matching the
        // behavior from the original tool.
        let slotsRemaining = totalSlots;
        const finalLines = baseProcessed.map(line => {
            let discountedAmt = 0;
            let isDiscounted = false;
            if ((line.type === 'Tablet' || line.type === 'Watch') && slotsRemaining > 0) {
                slotsRemaining--;
                discountedAmt = line.planBase * connectedDeviceDiscountRate;
                isDiscounted = true;
            }
            const actualPlanCost = isDiscounted ? (line.planBase - discountedAmt) : line.finalPlan;
            return {
                ...line,
                isDiscounted,
                connectedDiscountAmt: discountedAmt,
                totalLineCost: actualPlanCost + line.perkCost + line.protCost + line.deviceMonthly + line.adjSum + (includeEstimatedTaxes ? line.taxSurcharge : 0)
            };
        });

        // Account totals are intentionally calculated at the end so the UI can
        // display both per-line numbers and whole-account savings from one result.
        const protectableLinesCount = lines.filter(line => (
            line.type !== 'Home Internet' && (line.type !== 'Custom' || line.customIncludeInVmdp)
        )).length;
        const vmpCost = multiDeviceProtection ? Math.min(protectableLinesCount * multiProtection.perLine, multiProtection.monthlyCap) : 0;
        const accAdjSum = sumAdjustments(accountAdjustments);
        const totalEstimatedTaxes = includeEstimatedTaxes
            ? finalLines.reduce((acc, line) => acc + line.taxSurcharge, 0)
            : 0;
        const total = finalLines.reduce((acc, line) => acc + line.totalLineCost, 0) + vmpCost + accAdjSum;
        const totalFullDeviceSavings = finalLines.reduce((acc, line) => acc + parseAmount(line.promoCredit), 0);
        const totalAutopay = finalLines.reduce((acc, line) => acc + line.autopaySaving, 0);
        const totalMHSavings = finalLines.reduce((acc, line) => acc + line.mhSaving, 0);
        const totalPerkSavings = finalLines.reduce((acc, line) => acc + line.perkSavings, 0);
        const totalConnectedDiscounts = finalLines.reduce((acc, line) => acc + (line.connectedDiscountAmt || 0), 0);
        const totalMonthlyPromoCredits = finalLines.reduce((acc, line) => acc + line.monthlyPromoCredit, 0);
        const allAdjustments = [...finalLines.flatMap(line => line.adjustments), ...accountAdjustments];
        const totalAdjustmentCredits = allAdjustments.reduce((acc, adjustment) => acc + (adjustment.type === 'credit' ? parseAmount(adjustment.amount) : 0), 0);
        const totalOneTimeCredits = oneTimeCredits.reduce((acc, item) => (
            acc + ((item.type || 'credit') === 'credit' ? parseAmount(item.amount) : 0)
        ), 0);
        const totalOneTimeCharges = oneTimeCredits.reduce((acc, item) => (
            acc + (item.type === 'charge' ? parseAmount(item.amount) : 0)
        ), 0);
        const totalOneTimeNet = totalOneTimeCharges - totalOneTimeCredits;
        const totalMonthlySavings = totalMonthlyPromoCredits + totalAutopay + totalMHSavings + totalConnectedDiscounts + totalAdjustmentCredits + totalPerkSavings;

        return {
            processedLines: finalLines,
            total,
            vmpCost,
            accAdjSum,
            totalEstimatedTaxes,
            totalWithoutAutopay: total + totalAutopay,
            totalFullDeviceSavings,
            totalMonthlySavings,
            totalAutopay,
            totalMHSavings,
            totalPerkSavings,
            totalAdjustmentCredits,
            totalConnectedDiscounts,
            totalOneTimeCredits,
            totalOneTimeCharges,
            totalOneTimeNet
        };
    };

    const loadPricingConfig = async () => {
        const response = await fetch('pricing.json', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Unable to load pricing.json (${response.status})`);
        return validatePricingConfig(await response.json());
    };

    window.QuoteTool = {
        ...(window.QuoteTool || {}),
        calculateQuote,
        loadPricingConfig
    };
})();
