/*
    Share-link helpers.

    This file handles the compressed #v2quote links. It knows how to turn the
    current quote state into a URL, read that URL back into state, and copy the
    link to the clipboard.

    If quote links ever need to support versions or migrations, this is the
    right place to make that change.
*/
(function () {
    const SHARE_PREFIX = '#v2quote=';

    const serializeQuoteState = (state) => (
        LZString.compressToEncodedURIComponent(JSON.stringify(state))
    );

    const parseQuoteHash = (hash) => {
        if (!hash.startsWith(SHARE_PREFIX)) return null;

        const compressed = hash.substring(SHARE_PREFIX.length);
        const jsonString = LZString.decompressFromEncodedURIComponent(compressed);
        return jsonString ? JSON.parse(jsonString) : null;
    };

    const createShareUrl = (state) => {
        const compressed = serializeQuoteState(state);
        return `${window.location.origin}${window.location.pathname}${SHARE_PREFIX}${compressed}`;
    };

    const copyTextToClipboard = (text) => {
        // This old-school copy path works in more embedded/browser contexts than
        // navigator.clipboard, so we keep it even though it is not glamorous.
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();

        try {
            document.execCommand('copy');
            return true;
        } catch (error) {
            console.error('Failed to copy link', error);
            return false;
        } finally {
            document.body.removeChild(textArea);
        }
    };

    window.QuoteTool = {
        ...(window.QuoteTool || {}),
        parseQuoteHash,
        createShareUrl,
        copyTextToClipboard
    };
})();
