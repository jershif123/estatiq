document.addEventListener('DOMContentLoaded', () => {
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => Array.from(document.querySelectorAll(selector));
  const domResults = [];
  const acreResults = [];
  const counterFrames = new WeakMap();
  let toastTimer;

  const showToast = (message) => {
    const toast = $('#toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2300);
  };

  const flash = (element) => {
    if (!element) return;
    element.classList.remove('result-flash');
    void element.offsetWidth;
    element.classList.add('result-flash');
  };

  const animateValue = (element, value) => {
    if (!element) return;
    const target = Number(value);
    if (!Number.isFinite(target)) {
      element.textContent = value;
      return;
    }

    const previousFrame = counterFrames.get(element);
    if (previousFrame) cancelAnimationFrame(previousFrame);
    const storedValue = Number(element.dataset.value || 0);
    const startValue = Number.isFinite(storedValue) ? storedValue : 0;
    const fractionDigits = Number.isInteger(target) ? 0 : 1;
    const started = performance.now();
    const duration = 360;
    element.dataset.value = String(target);
    const render = (time) => {
      const progress = Math.min((time - started) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (target - startValue) * eased;
      element.textContent = current.toLocaleString(undefined, {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
      });
      if (progress < 1) {
        counterFrames.set(element, requestAnimationFrame(render));
      } else {
        counterFrames.delete(element);
      }
    };
    counterFrames.set(element, requestAnimationFrame(render));
  };

  const setValueImmediately = (element, value) => {
    if (!element) return;
    const previousFrame = counterFrames.get(element);
    if (previousFrame) cancelAnimationFrame(previousFrame);
    counterFrames.delete(element);
    element.dataset.value = Number.isFinite(Number(value)) ? String(value) : '0';
    element.textContent = String(value);
  };

  const apiPost = async (endpoint, payload) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok || !result.success) {
      throw new Error(result.error || 'The calculation could not be completed.');
    }
    return result;
  };

  const copyToClipboard = async (text) => {
    if (!text.trim()) {
      showToast('There is no result to copy yet.');
      return;
    }
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const temporaryInput = document.createElement('textarea');
        temporaryInput.value = text;
        temporaryInput.setAttribute('readonly', '');
        temporaryInput.style.position = 'fixed';
        temporaryInput.style.opacity = '0';
        document.body.appendChild(temporaryInput);
        temporaryInput.select();
        const copied = document.execCommand('copy');
        temporaryInput.remove();
        if (!copied) throw new Error('Clipboard access is unavailable in this browser.');
      }
      showToast('Copied to clipboard.');
    } catch (error) {
      showToast(error.message || 'Could not copy to clipboard.');
    }
  };

  const csvEscape = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const downloadCsv = (filename, headers, rows) => {
    if (!rows.length) {
      showToast('Calculate at least one result before downloading.');
      return;
    }
    const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('CSV download started.');
  };

  const setEmptyRow = (tbody, columns, message) => {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = columns;
    cell.innerHTML = `<span class="empty-icon">⌁</span><br />`;
    cell.append(document.createTextNode(message));
    row.appendChild(cell);
    tbody.replaceChildren(row);
  };

  const addCell = (row, value, className = '') => {
    const cell = document.createElement('td');
    cell.textContent = value;
    if (className) cell.className = className;
    row.appendChild(cell);
  };

  const renderDomResults = () => {
    const tbody = $('#dom-results-body');
    if (!tbody) return;
    if (!domResults.length) {
      setEmptyRow(tbody, 4, 'No calculations yet. Paste a few rows to get started.');
      $('#dom-results-caption').textContent = 'Your results will appear here';
      ['dom-total', 'dom-average', 'dom-highest', 'dom-lowest'].forEach((id) => {
        const element = document.getElementById(id);
        setValueImmediately(element, id === 'dom-total' ? 0 : '—');
      });
      $('#dom-latest-value').textContent = '— DAYS';
      return;
    }

    const fragment = document.createDocumentFragment();
    domResults.forEach((result, index) => {
      const row = document.createElement('tr');
      addCell(row, String(index + 1));
      addCell(row, result.listing_date);
      addCell(row, result.sale_date);
      addCell(row, `${result.days} days`, 'numeric-cell result-number');
      fragment.appendChild(row);
    });
    tbody.replaceChildren(fragment);
    $('#dom-results-caption').textContent = `${domResults.length} ${domResults.length === 1 ? 'record' : 'records'} calculated`;
    $('#dom-latest-value').textContent = `${domResults[domResults.length - 1].days} DAYS`;
    flash($('#dom-latest-value'));

    const days = domResults.map((item) => item.days);
    animateValue($('#dom-total'), days.length);
    animateValue($('#dom-average'), days.reduce((sum, item) => sum + item, 0) / days.length);
    animateValue($('#dom-highest'), Math.max(...days));
    animateValue($('#dom-lowest'), Math.min(...days));
    $$('.dom-summary .summary-card').forEach(flash);
  };

  const renderAcreResults = () => {
    const tbody = $('#acre-results-body');
    if (!tbody) return;
    if (!acreResults.length) {
      setEmptyRow(tbody, 3, 'Your converted values will appear here.');
      $('#acre-results-caption').textContent = 'Ready for your entries';
      ['acre-total', 'acre-total-area', 'acre-total-sqft'].forEach((id) => {
        const element = document.getElementById(id);
        setValueImmediately(element, id === 'acre-total' ? 0 : '—');
      });
      return;
    }

    const fragment = document.createDocumentFragment();
    acreResults.forEach((result, index) => {
      const row = document.createElement('tr');
      addCell(row, String(index + 1));
      addCell(row, result.acres);
      addCell(row, `${result.square_feet} sq ft`, 'numeric-cell result-number');
      fragment.appendChild(row);
    });
    tbody.replaceChildren(fragment);
    $('#acre-results-caption').textContent = `${acreResults.length} ${acreResults.length === 1 ? 'conversion' : 'conversions'}`;

    const sumFixed = (items, key, digits) => {
      const scale = 10n ** BigInt(digits);
      const total = items.reduce((sum, item) => {
        const [whole, fraction = ''] = item[key].split('.');
        return sum + BigInt(whole) * scale + BigInt(fraction.padEnd(digits, '0').slice(0, digits) || '0');
      }, 0n);
      const whole = (total / scale).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      const fraction = (total % scale).toString().padStart(digits, '0');
      return `${whole}.${fraction}`;
    };
    animateValue($('#acre-total'), acreResults.length);
    $('#acre-total-area').textContent = sumFixed(acreResults, 'acres', 4);
    $('#acre-total-sqft').textContent = sumFixed(acreResults, 'square_feet', 2);
    $$('.acre-summary .summary-card').forEach(flash);
  };

  const parseDomRows = (input) => {
    const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) throw new Error('Paste at least one listing and sale date row.');
    const entries = lines.map((line, index) => {
      const values = line.includes('\t')
        ? line.split('\t')
        : line.includes(',')
          ? line.split(',')
          : line.split(/\s+/);
      const dates = values.map((value) => value.trim()).filter(Boolean);
      if (index === 0 && dates.length >= 2 && /listing|sale|close/i.test(line)) return null;
      if (dates.length < 2) {
        throw new Error(`Row ${index + 1}: include a listing date and sale date separated by a tab or comma.`);
      }
      return { listing_date: dates[0], sale_date: dates[1] };
    }).filter(Boolean);
    if (!entries.length) throw new Error('Paste at least one listing and sale date row.');
    return entries;
  };

  const parseAcreRows = (input) => {
    const values = input.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
    if (!values.length) throw new Error('Paste at least one acreage value.');
    return values.map((acres) => ({ acres }));
  };

  const updateDomInputCount = () => {
    const input = $('#dom-bulk-input');
    if (!input) return;
    const count = input.value.split(/\r?\n/).filter((line) => line.trim()).length;
    $('#dom-input-count').textContent = `${count} ${count === 1 ? 'ROW' : 'ROWS'}`;
  };
  const updateAcreInputCount = () => {
    const input = $('#acre-bulk-input');
    if (!input) return;
    const count = input.value.split(/[\s,]+/).filter((value) => value.trim()).length;
    $('#acre-input-count').textContent = `${count} ${count === 1 ? 'VALUE' : 'VALUES'}`;
  };

  const themeToggle = $('[data-theme-toggle]');
  try {
    if (localStorage.getItem('estatiq-theme') === 'light') document.body.classList.add('light-theme');
    themeToggle?.addEventListener('click', () => {
      document.body.classList.toggle('light-theme');
      localStorage.setItem('estatiq-theme', document.body.classList.contains('light-theme') ? 'light' : 'dark');
    });
  } catch (error) {
    themeToggle?.addEventListener('click', () => document.body.classList.toggle('light-theme'));
  }

  $$('.tab-button').forEach((button) => {
    button.addEventListener('click', () => {
      $$('.tab-button').forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
      });
      $$('.workspace-tab').forEach((panel) => {
        const selected = panel.id === button.dataset.tab;
        panel.classList.toggle('active', selected);
        panel.hidden = !selected;
      });
    });
  });

  $$('[data-dom-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      $$('[data-dom-mode]').forEach((modeButton) => {
        const selected = modeButton === button;
        modeButton.classList.toggle('active', selected);
        modeButton.setAttribute('aria-pressed', String(selected));
      });
      const useBulk = button.dataset.domMode === 'bulk';
      $('#dom-bulk-panel').hidden = !useBulk;
      $('#dom-manual-panel').hidden = useBulk;
    });
  });

  const aboutModal = $('#about-modal');
  $('#about-open')?.addEventListener('click', () => aboutModal?.showModal());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && aboutModal?.open) aboutModal.close();
  });
  aboutModal?.addEventListener('click', (event) => {
    if (event.target === aboutModal) aboutModal.close();
  });

  $('#dom-bulk-input')?.addEventListener('input', updateDomInputCount);
  $('#acre-bulk-input')?.addEventListener('input', updateAcreInputCount);

  $('#process-dom-bulk')?.addEventListener('click', async () => {
    const button = $('#process-dom-bulk');
    button.disabled = true;
    try {
      const entries = parseDomRows($('#dom-bulk-input').value);
      const response = await apiPost('/api/dom', { entries });
      domResults.splice(0, domResults.length, ...response.results);
      renderDomResults();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  $('#dom-single-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      const response = await apiPost('/api/dom', data);
      domResults.splice(0, domResults.length, {
        listing_date: data.listing_date,
        sale_date: data.sale_date,
        days: response.days,
      });
      renderDomResults();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });

  $('#dom-copy-all')?.addEventListener('click', () => {
    copyToClipboard(domResults.map((item) => `${item.listing_date}\t${item.sale_date}\t${item.days}`).join('\n'));
  });
  $('#dom-copy-only')?.addEventListener('click', () => {
    copyToClipboard(domResults.map((item) => item.days).join('\n'));
  });
  $('#dom-download')?.addEventListener('click', () => {
    downloadCsv('estatiq-dom-results.csv', ['Listing Date', 'Sale Date', 'Days on Market'], domResults.map((item) => [item.listing_date, item.sale_date, item.days]));
  });
  $('#dom-clear')?.addEventListener('click', () => {
    $('#dom-bulk-input').value = '';
    $('#dom-single-form').reset();
    domResults.length = 0;
    updateDomInputCount();
    renderDomResults();
    showToast('DOM inputs and results cleared.');
  });

  const renderSingleAcre = (result) => {
    const value = $('#acre-single-sqft');
    value.style.opacity = '0.25';
    value.style.transform = 'translateY(3px)';
    window.setTimeout(() => {
      value.textContent = Number(result.square_feet).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      $('#acre-single-acres').textContent = `${result.acres} acres`;
      value.style.opacity = '1';
      value.style.transform = 'translateY(0)';
      flash(value);
    }, 100);
  };

  const acreSingleForm = $('#acre-single-form');
  const calculateSingleAcre = async () => {
    const data = Object.fromEntries(new FormData(acreSingleForm).entries());
    const response = await apiPost('/api/acre', data);
    renderSingleAcre(response);
    return response;
  };
  acreSingleForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = acreSingleForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await calculateSingleAcre();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  $('#acre-copy-single')?.addEventListener('click', () => copyToClipboard($('#acre-single-sqft').textContent));

  $('#process-acre-bulk')?.addEventListener('click', async () => {
    const button = $('#process-acre-bulk');
    button.disabled = true;
    try {
      const entries = parseAcreRows($('#acre-bulk-input').value);
      const response = await apiPost('/api/acre', { entries });
      acreResults.splice(0, acreResults.length, ...response.results);
      renderAcreResults();
    } catch (error) {
      showToast(error.message);
    } finally {
      button.disabled = false;
    }
  });
  $('#acre-copy-sqft')?.addEventListener('click', () => {
    copyToClipboard(acreResults.map((item) => item.square_feet).join('\n'));
  });
  $('#acre-copy-all')?.addEventListener('click', () => {
    copyToClipboard(acreResults.map((item) => `${item.acres}\t${item.square_feet}`).join('\n'));
  });
  $('#acre-download')?.addEventListener('click', () => {
    downloadCsv('estatiq-acre-conversions.csv', ['Acres', 'Square Feet'], acreResults.map((item) => [item.acres, item.square_feet]));
  });
  $('#acre-clear')?.addEventListener('click', () => {
    $('#acre-bulk-input').value = '';
    acreResults.length = 0;
    updateAcreInputCount();
    renderAcreResults();
    showToast('Bulk acreage inputs and results cleared.');
  });

  updateDomInputCount();
  updateAcreInputCount();
  renderDomResults();
  renderAcreResults();
  calculateSingleAcre().catch((error) => showToast(error.message));

  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (finePointer.matches && !reducedMotion.matches) {
    let pointerFrame = 0;
    let pointerX = 0;
    let pointerY = 0;
    document.addEventListener('pointermove', (event) => {
      pointerX = event.clientX;
      pointerY = event.clientY;
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        document.documentElement.style.setProperty('--pointer-x', `${pointerX}px`);
        document.documentElement.style.setProperty('--pointer-y', `${pointerY}px`);
        document.body.classList.add('pointer-active');
        pointerFrame = 0;
      });
    }, { passive: true });

    $$('.input-panel, .summary-card').forEach((card) => {
      card.addEventListener('pointermove', (event) => {
        const bounds = card.getBoundingClientRect();
        card.style.setProperty('--card-x', `${event.clientX - bounds.left}px`);
        card.style.setProperty('--card-y', `${event.clientY - bounds.top}px`);
      }, { passive: true });
    });
  }
});
