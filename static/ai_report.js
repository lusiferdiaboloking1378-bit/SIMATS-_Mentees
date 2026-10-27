(() => {
    let reportResults = [];

    const setVisibility = (id, visible) => {
        document.getElementById(id)?.classList.toggle('hidden', !visible);
    };

    const renderSummary = () => {
        const lowCount = reportResults.filter(item => item.low_count > 0).length;
        const eventCount = reportResults.filter(item => item.has_event).length;
        const fallbackCount = reportResults.filter(item => !item.ai_generated).length;
        const summary = document.getElementById('ai-summary-text');
        if (summary) {
            summary.textContent =
                `${reportResults.length} mentee(s) · ${lowCount} with low attendance · ` +
                `${eventCount} with event participation · ${fallbackCount} template comment(s)`;
        }
    };

    const renderCards = () => {
        const container = document.getElementById('ai-cards-container');
        if (!container) return;
        container.replaceChildren();

        reportResults.forEach((result, index) => {
            const card = document.createElement('article');
            card.className = 'glass rounded-2xl border border-white/10 p-5';

            const heading = document.createElement('div');
            heading.className = 'flex flex-wrap items-center justify-between gap-3 mb-3';
            const identity = document.createElement('h2');
            identity.className = 'text-white font-bold';
            identity.textContent = `${result.name || 'Mentee'} (${result.reg_no})`;
            const status = document.createElement('span');
            status.className = result.ai_generated
                ? 'text-[10px] px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 font-bold'
                : 'text-[10px] px-2 py-1 rounded-full bg-amber-500/20 text-amber-400 font-bold';
            status.textContent = result.ai_generated ? 'AI generated' : 'Template fallback';
            heading.append(identity, status);
            card.appendChild(heading);

            if (result.ai_warning) {
                const warning = document.createElement('p');
                warning.className = 'text-amber-300 text-xs mb-3';
                warning.textContent = result.ai_warning;
                card.appendChild(warning);
            }

            const textarea = document.createElement('textarea');
            textarea.id = `ai-comment-${index}`;
            textarea.className = 'premium-input bg-[#0d1117] min-h-32 text-sm leading-relaxed';
            textarea.value = result.comment || '';
            textarea.setAttribute('aria-label', `Comment for ${result.name || result.reg_no}`);
            card.appendChild(textarea);

            const actions = document.createElement('div');
            actions.className = 'flex flex-wrap justify-end gap-2 mt-3';
            const copyButton = document.createElement('button');
            copyButton.type = 'button';
            copyButton.className = 'glass border border-white/10 text-gray-300 hover:text-white transition text-xs font-bold px-3 py-2 rounded-lg';
            copyButton.textContent = 'Copy comment';
            copyButton.addEventListener('click', () => copyComment(textarea, copyButton));
            const regenerateButton = document.createElement('button');
            regenerateButton.type = 'button';
            regenerateButton.className = 'glass border border-violet-500/30 text-violet-300 hover:text-white transition text-xs font-bold px-3 py-2 rounded-lg';
            regenerateButton.textContent = 'Regenerate';
            regenerateButton.addEventListener('click', () => regenerateComment(result.reg_no, index, regenerateButton));
            actions.append(copyButton, regenerateButton);
            card.appendChild(actions);
            container.appendChild(card);
        });

        renderSummary();
    };

    const copyComment = async (textarea, button) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(textarea.value);
            } else {
                const copyField = document.createElement('textarea');
                copyField.value = textarea.value;
                copyField.style.position = 'fixed';
                copyField.style.opacity = '0';
                document.body.appendChild(copyField);
                copyField.select();
                const copied = document.execCommand('copy');
                copyField.remove();
                if (!copied) throw new Error('Clipboard access is unavailable.');
            }
            button.textContent = 'Copied';
            window.setTimeout(() => { button.textContent = 'Copy comment'; }, 1500);
        } catch (error) {
            window.alert(`Could not copy the comment: ${error.message}`);
        }
    };

    const requestComments = async (payload) => {
        const response = await fetch('/generate_comment_report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(result.error || `Server error ${response.status}`);
        }
        return result;
    };

    window.generateCommentReport = async () => {
        const button = document.getElementById('ai-generate-btn');
        setVisibility('ai-error', false);
        setVisibility('ai-preview-area', false);
        setVisibility('ai-loading', true);
        if (button) button.disabled = true;
        try {
            reportResults = await requestComments({});
            renderCards();
            setVisibility('ai-preview-area', true);
        } catch (error) {
            const errorElement = document.getElementById('ai-error');
            if (errorElement) errorElement.textContent = `Failed to generate comments: ${error.message}`;
            setVisibility('ai-error', true);
        } finally {
            setVisibility('ai-loading', false);
            if (button) button.disabled = false;
        }
    };

    const regenerateComment = async (regNo, index, button) => {
        button.disabled = true;
        try {
            const results = await requestComments({ reg_nos: [regNo] });
            if (!results.length) throw new Error('No comment was returned.');
            reportResults[index] = results[0];
            renderCards();
        } catch (error) {
            window.alert(`Could not regenerate comment: ${error.message}`);
        } finally {
            button.disabled = false;
        }
    };

    window.downloadDocx = async () => {
        const errorElement = document.getElementById('ai-error');
        setVisibility('ai-error', false);
        try {
            if (!reportResults.length) throw new Error('Generate comments before downloading the report.');
            const comments = reportResults.map((item, index) => ({
                reg_no: item.reg_no,
                name: item.name,
                comment: document.getElementById(`ai-comment-${index}`)?.value || '',
                low_count: item.low_count,
                has_event: item.has_event,
            }));
            const response = await fetch('/download_comment_report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    mentor_name: document.getElementById('ai-mentor-name')?.value || '',
                    comments,
                }),
            });
            if (!response.ok) {
                const error = await response.json().catch(() => ({}));
                throw new Error(error.error || `Server error ${response.status}`);
            }
            const url = URL.createObjectURL(await response.blob());
            const link = document.createElement('a');
            link.href = url;
            link.download = 'Mentor_Comment_Report.docx';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            if (errorElement) errorElement.textContent = `Could not download report: ${error.message}`;
            setVisibility('ai-error', true);
        }
    };
})();
