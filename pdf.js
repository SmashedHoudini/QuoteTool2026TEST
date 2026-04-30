/*
    PDF export helpers.

    This file captures the print-preview HTML and saves it as a letter-sized
    PDF. The UI already renders the pages; this module just clones those pages,
    captures them cleanly, and hands the final image pages to jsPDF.

    If the preview looks right but the saved PDF looks wrong, start here.
*/
(function () {
    const PDF_PAGE_WIDTH = 612;
    const PDF_PAGE_HEIGHT = 792;
    const CAPTURE_WIDTH = 850;

    const createPdfFilename = (customerName) => {
        const firstName = customerName.trim().split(' ')[0];
        return `${firstName ? `${firstName}_` : ''}Verizon_Quote.pdf`;
    };

    const saveQuotePdf = async ({ paginatedContent, customerName, setIsGeneratingPdf }) => {
        setIsGeneratingPdf(true);

        // Fonts can finish loading after React renders. Waiting here keeps the
        // exported PDF from looking subtly different than the preview.
        await document.fonts.ready;

        const originalScrollY = window.scrollY;
        window.scrollTo(0, 0);

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ format: 'letter', unit: 'pt' });
        const hiddenWorkspace = document.createElement('div');
        hiddenWorkspace.style.position = 'absolute';
        hiddenWorkspace.style.top = '0px';
        hiddenWorkspace.style.left = '-9999px';
        document.body.appendChild(hiddenWorkspace);

        try {
            for (let i = 0; i < paginatedContent.length; i++) {
                const pageNode = document.getElementById(`pdf-page-render-${i}`);
                const clone = pageNode.cloneNode(true);

                // Mobile preview may be scaled down. PDF capture always uses the
                // full-size page so the saved file stays crisp.
                clone.style.transform = 'none';
                clone.style.margin = '0';
                hiddenWorkspace.appendChild(clone);

                const canvas = await html2canvas(clone, {
                    scale: 2,
                    useCORS: true,
                    backgroundColor: '#ffffff',
                    logging: false,
                    windowWidth: CAPTURE_WIDTH
                });

                const imgData = canvas.toDataURL('image/jpeg', 0.98);
                if (i > 0) doc.addPage();
                doc.addImage(imgData, 'JPEG', 0, 0, PDF_PAGE_WIDTH, PDF_PAGE_HEIGHT);

                hiddenWorkspace.innerHTML = '';
            }

            doc.save(createPdfFilename(customerName));
        } catch (error) {
            console.error('PDF Generation Error:', error);
        } finally {
            document.body.removeChild(hiddenWorkspace);
            window.scrollTo(0, originalScrollY);
            setIsGeneratingPdf(false);
        }
    };

    window.QuoteTool = {
        ...(window.QuoteTool || {}),
        saveQuotePdf
    };
})();
