import { tableFromLists } from './table.js';

// Shared render helpers for code analysis result visualizations.
// Used by both individual.js and pairwise.js.

// Utility helpers.

function escapeHTML(str) {
    if (str === null || str === undefined) {
        return '';
    }
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function formatNumber(value, decimalPlaces = 2) {
    if (value === null || value === undefined) {
        return '-';
    }
    const num = Number(value);
    if (!Number.isFinite(num)) {
        return '-';
    }
    return num.toFixed(decimalPlaces);
}

function formatPercent(value) {
    if (value === null || value === undefined) {
        return '-';
    }
    return formatNumber(value * 100, 1) + '%';
}

function msToSeconds(ms) {
    if (ms === null || ms === undefined) {
        return '-';
    }
    return formatNumber(ms / 1000) + 's';
}

// Visual render helpers.

// Renders a horizontal progress bar.
// maxValue should come from summary aggregate max — never hardcoded.
function scoreBar(value, maxValue) {
    if (value === null || value === undefined || !maxValue || maxValue === 0) {
        return `<span>-</span>`;
    }
    const pct = Math.min(100, (value / maxValue) * 100).toFixed(1);
    return `
        <div class='score-bar-container'>
            <div class='score-bar-track'>
                <div class='score-bar-fill' style='width:${pct}%'></div>
            </div>
            <span>${formatNumber(value)}</span>
        </div>
    `;
}

// Renders a colored similarity bar: green (low) / orange (mid) / red (high).
function similarityBar(score) {
    if (score === null || score === undefined) {
        return `<span>-</span>`;
    }
    let cls = 'similarity-low';
    if (score >= 0.5) {
        cls = 'similarity-high';
    } else if (score >= 0.2) {
        cls = 'similarity-mid';
    }
    const pct = Math.min(100, score * 100).toFixed(1);
    return `
        <div class='score-bar-container'>
            <div class='score-bar-track'>
                <div class='score-bar-fill ${cls}' style='width:${pct}%'></div>
            </div>
            <span>${formatPercent(score)}</span>
        </div>
    `;
}

// Converts an aggregate object to an array of formatted strings for tableFromLists.
function aggregateToRow(aggregate) {
    if (!aggregate) {
        return ['-', '-', '-', '-', '-'];
    }
    return [
        formatNumber(aggregate['count'], 0),
        formatNumber(aggregate['mean']),
        formatNumber(aggregate['median']),
        formatNumber(aggregate['min']),
        formatNumber(aggregate['max']),
    ];
}

// Returns styled pending/empty state paragraph.
function pendingState(message = 'Data pending or unavailable.') {
    return `<p class='analysis-pending'>${escapeHTML(message)}</p>`;
}

// Wraps content in a titled analysis section block.
function analysisSection(title, bodyHTML) {
    return `
        <div class='analysis-section'>
            <h3>${escapeHTML(title)}</h3>
            ${bodyHTML}
        </div>
    `;
}

// Collapsible raw JSON fallback for debugging.
function rawJsonFallback(result) {
    const json = JSON.stringify(result, null, 4);
    return `
        <details class='raw-json-fallback'>
            <summary>Raw JSON</summary>
            <pre class='code-block'>${escapeHTML(json)}</pre>
        </details>
    `;
}

// Individual analysis sections.

function renderIndividualAnalysis(result) {
    const summary = result['summary'];
    const results = result['results'] ?? {};
    const isComplete = result['complete'];

    let html = '';

    // Pending banner.
    if (!isComplete) {
        html += `<p class='analysis-pending'>Analysis is still running. Showing partial data.</p>`;
    }

    // Summary stats.
    const headers = ['Metric', 'Count', 'Mean', 'Median', 'Min', 'Max'];
    const summaryItems = [
        ['Score',         summary['aggregate-score']],
        ['Lines of Code', summary['aggregate-lines-of-code']],
        ['Time Delta',    summary['aggregate-submission-time-delta']],
        ['LOC Delta',     summary['aggregate-lines-of-code-delta']],
        ['Score Delta',   summary['aggregate-score-delta']],
        ['LOC / hr (Velocity)',   summary['aggregate-lines-of-code-per-hour']],
        ['Score / hr (Velocity)', summary['aggregate-score-per-hour']],
    ];

    const summaryRows = summaryItems.map(function(item) {
        const row = [escapeHTML(item[0])];
        return row.concat(aggregateToRow(item[1]));
    });

    let summaryHTML = tableFromLists(headers, summaryRows, ['analysis-summary-table']);

    // Per-file LOC sub-table.
    const locPerFile = summary['aggregate-lines-of-code-per-file'];
    if (locPerFile) {
        const fileNames = Object.keys(locPerFile).sort();
        const fileRows = fileNames.map(function(filename) {
            const row = [escapeHTML(filename)];
            return row.concat(aggregateToRow(locPerFile[filename]));
        });

        const fileHeaders = ['File', 'Count', 'Mean', 'Median', 'Min', 'Max'];
        summaryHTML += `
            <h4 class='analysis-loc-header'>Lines of Code per File</h4>
            ${tableFromLists(fileHeaders, fileRows, ['analysis-loc-per-file-table'])}
        `;
    } else {
        summaryHTML += pendingState('Per-file LOC breakdown not yet available.');
    }

    html += analysisSection('Summary Statistics', summaryHTML);

    // Per-submission table.
    const dynamicMax = summary['aggregate-score']?.['max'] ?? 1;
    const submissionIDs = Object.keys(results).sort();

    let resultsHTML = '';
    if (submissionIDs.length === 0) {
        resultsHTML = pendingState('No individual results yet.');
    } else {
        const resHeaders = [
            'Submission ID', 'Score', 'LOC', 'Time Delta', 'LOC Delta',
            'Score Delta', 'LOC / hr', 'Score / hr'
        ];

        const rows = submissionIDs.map(function(id) {
            const r = results[id];
            const shortId = escapeHTML(r['short-id'] ?? id);

            return [
                `<span title='${escapeHTML(id)}'>${shortId}</span>`,
                scoreBar(r['score'] ?? null, dynamicMax),
                formatNumber(r['lines-of-code'] ?? null, 0),
                msToSeconds(r['submission-time-delta'] ?? null),
                formatNumber(r['lines-of-code-delta'] ?? null, 0),
                formatNumber(r['score-delta'] ?? null),
                formatNumber(r['lines-of-code-per-hour'] ?? null),
                formatNumber(r['score-per-hour'] ?? null)
            ];
        });

        resultsHTML = tableFromLists(resHeaders, rows, ['analysis-results-table']);
    }

    html += analysisSection('Per-Submission Results', resultsHTML);

    // Raw JSON fallback.
    html += rawJsonFallback(result);

    return html;
}

// Pairwise analysis sections.

function renderPairwiseAnalysis(result) {
    const summary = result['summary'];
    const results = result['results'] ?? {};
    const isComplete = result['complete'];

    let html = '';

    if (!isComplete) {
        html += `<p class='analysis-pending'>Analysis is still running. Showing partial data.</p>`;
    }

    // Similarity summary.
    const totalMean = summary['aggregate-total-mean-similarity'];
    let summaryHTML = `
        <div class='pairwise-overall-summary'>
            <strong>Overall Mean Similarity:</strong>
            ${similarityBar(totalMean?.['mean'] ?? null)}
        </div>
    `;

    const meanSims = summary['aggregate-mean-similarities'];
    if (meanSims) {
        const fileNames = Object.keys(meanSims).sort();
        const headers = ['File', 'Count', 'Mean', 'Median', 'Min', 'Max'];
        
        const fileRows = fileNames.map(function(filename) {
            const row = [escapeHTML(filename)];
            return row.concat(aggregateToRow(meanSims[filename]));
        });

        summaryHTML += tableFromLists(headers, fileRows, ['pairwise-summary']);
    } else {
        summaryHTML += pendingState('Per-file similarity summary not yet available.');
    }

    html += analysisSection('Similarity Summary', summaryHTML);

    // Per-pair flattened table.
    const pairKeys = Object.keys(results).sort();
    let pairsHTML = '';

    if (pairKeys.length === 0) {
        pairsHTML = pendingState('No pairwise results yet.');
    } else {
        const resHeaders = ['Pair (short IDs)', 'File', 'Tool', 'Similarity'];
        let rows = [];

        for (let i = 0; i < pairKeys.length; i++) {
            const pairKey = pairKeys[i];
            const pair = results[pairKey];
            const sims = pair['similarities'] ?? {};
            const fileNames = Object.keys(sims).sort();

            // Shorten pair key for display — keep only short IDs.
            const parts = pairKey.split('||');
            const shortDisplay = parts.map(function(p) {
                const segs = p.split('::');
                return segs[segs.length - 1] ?? p;
            }).join(' || ');

            const shortSpan = `<span title='${escapeHTML(pairKey)}'>${escapeHTML(shortDisplay)}</span>`;

            let pairHasRows = false;
            for (let j = 0; j < fileNames.length; j++) {
                const filename = fileNames[j];
                const toolEntries = sims[filename] ?? [];
                
                for (let k = 0; k < toolEntries.length; k++) {
                    const entry = toolEntries[k];
                    rows.push([
                        shortSpan,
                        escapeHTML(filename),
                        escapeHTML(entry['tool'] ?? '-'),
                        similarityBar(entry['score'] ?? null)
                    ]);
                    pairHasRows = true;
                }
            }

            // Fallback: no files at all, OR files exist but all tool entry arrays were empty.
            if (!pairHasRows) {
                rows.push([
                    shortSpan,
                    pendingState('No tool results available.'),
                    '-',
                    '-'
                ]);
            }
        }

        pairsHTML = tableFromLists(resHeaders, rows, ['pairwise-pairs-table']);
    }

    html += analysisSection('Per-Pair Comparisons', pairsHTML);

    // Raw JSON fallback.
    html += rawJsonFallback(result);

    return html;
}

export {
    escapeHTML,
    formatNumber,
    formatPercent,
    msToSeconds,
    scoreBar,
    similarityBar,
    aggregateToRow,
    pendingState,
    analysisSection,
    rawJsonFallback,
    renderIndividualAnalysis,
    renderPairwiseAnalysis,
};
