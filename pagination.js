/*
    Print/PDF pagination helpers.

    The print preview is built as HTML pages first, then pdf.js captures those
    pages into a PDF. This file estimates how tall each quote section will be
    and decides which items belong on each page.

    These numbers are intentionally conservative because a slightly roomier PDF
    is better than a line getting chopped between pages.
*/
(function () {
    const FIRST_PAGE_START_HEIGHT = 320;
    const NEXT_PAGE_START_HEIGHT = 60;
    const MAX_SAFE_PAGE_HEIGHT = 980;
    const FOOTER_HEIGHT = 180;
    const DETAIL_ROW_HEIGHT = 18;

    const estimateLineHeight = (line, customerViewMode, includeEstimatedTaxes) => {
        if (customerViewMode !== 'detailed') {
            return 70 + (line.perks.length > 0 ? DETAIL_ROW_HEIGHT : 0);
        }

        return 90
            + (line.perks.length * DETAIL_ROW_HEIGHT)
            + (line.adjustments.length * DETAIL_ROW_HEIGHT)
            + (line.deviceName ? 20 : 0)
            + (line.autopaySaving > 0 ? DETAIL_ROW_HEIGHT : 0)
            + (line.mhSaving > 0 ? DETAIL_ROW_HEIGHT : 0)
            + (line.isDiscounted ? DETAIL_ROW_HEIGHT : 0)
            + (line.devicePrice > 0 ? DETAIL_ROW_HEIGHT : 0)
            + (line.protCost > 0 ? DETAIL_ROW_HEIGHT : 0)
            + (includeEstimatedTaxes && line.taxSurcharge > 0 ? DETAIL_ROW_HEIGHT : 0);
    };

    const paginateQuote = ({ calculations, customerViewMode, multiDeviceProtection, accountAdjustments, oneTimeCredits, includeEstimatedTaxes }) => {
        // The PDF view is HTML first, then captured into a PDF. These estimates
        // decide where to split pages so the capture does not chop a line in half.
        const pages = [];
        let currentItems = [];
        let currentHeight = FIRST_PAGE_START_HEIGHT;

        const pushPage = (isLast = false) => {
            pages.push({ id: pages.length, items: [...currentItems], isFirst: pages.length === 0, isLast });
            currentItems = [];
            currentHeight = NEXT_PAGE_START_HEIGHT;
        };

        calculations.processedLines.forEach(line => {
            const itemHeight = estimateLineHeight(line, customerViewMode, includeEstimatedTaxes);
            if (currentHeight + itemHeight > MAX_SAFE_PAGE_HEIGHT) pushPage();
            currentItems.push({ type: 'line', data: line });
            currentHeight += itemHeight;
        });

        if (multiDeviceProtection || accountAdjustments.length > 0) {
            const itemHeight = customerViewMode === 'detailed'
                ? 60 + (multiDeviceProtection ? DETAIL_ROW_HEIGHT : 0) + (accountAdjustments.length * DETAIL_ROW_HEIGHT)
                : 60;
            if (currentHeight + itemHeight > MAX_SAFE_PAGE_HEIGHT) pushPage();
            currentItems.push({ type: 'account_services' });
            currentHeight += itemHeight;
        }

        if (oneTimeCredits.length > 0) {
            const itemHeight = customerViewMode === 'detailed'
                ? 60 + (oneTimeCredits.length * DETAIL_ROW_HEIGHT)
                : 60;
            if (currentHeight + itemHeight > MAX_SAFE_PAGE_HEIGHT) pushPage();
            currentItems.push({ type: 'otc' });
            currentHeight += itemHeight;
        }

        if (currentHeight + FOOTER_HEIGHT > MAX_SAFE_PAGE_HEIGHT) pushPage();
        currentItems.push({ type: 'footer' });

        pushPage(true);
        return pages;
    };

    window.QuoteTool = {
        ...(window.QuoteTool || {}),
        paginateQuote
    };
})();
