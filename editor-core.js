(() => {
  const state = {
    unsavedChanges: false,
    suppressBlur: false
  };

  function normalize(str) {
    return String(str).replace(/\s+/g, ' ').trim();
  }

  function stripHtml(str) {
    return String(str).replace(/<[^>]+>/g, '');
  }

  function decodeEntities(str) {
    return String(str)
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/&nbsp;/g, '\u00a0');
  }

  function findElement({ tag, innerHTML }) {
    const elements = Array.from(document.querySelectorAll(tag));
    const type = /<[a-zA-Z]/.test(innerHTML) ? 'richtext' : 'text';
    const matches = [];

    for (const el of elements) {
      if (el.dataset.editorId) continue;
      if (type === 'richtext') {
        if (normalize(el.innerHTML) === normalize(innerHTML)) {
          matches.push(el);
        }
      } else if (normalize(el.textContent) === normalize(decodeEntities(stripHtml(innerHTML)))) {
        matches.push(el);
      }
    }

    if (!matches.length) return null;

    if (type === 'text') {
      const leaf = matches.find(el => el.children.length === 0);
      return leaf || matches[0];
    }

    return matches[matches.length - 1];
  }

  function annotate(el, id, innerHTML) {
    el.dataset.editorId = String(id);
    el.dataset.editorOriginal = innerHTML;
    el.classList.add('editor-editable');
    if (el.tagName.toLowerCase() === 'a') {
      setupAnchorHandlers(el);
    } else {
      el.setAttribute('contenteditable', 'true');
      setupEditableHandlers(el);
    }
  }

  function setupAnchorHandlers(el) {
    el.title = (el.title ? el.title + ' ' : '') + '[double-click to edit]';
    let clickTimer = null;

    el.addEventListener('click', e => {
      e.preventDefault();
      if (clickTimer) {
        clearTimeout(clickTimer);
        clickTimer = null;
        // Double-click: enter edit mode
        el.setAttribute('contenteditable', 'true');
        el.classList.add('editor-active');
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        // Single click: wait to see if second click comes
        clickTimer = setTimeout(() => {
          clickTimer = null;
          const href = el.getAttribute('href');
          if (href) window.location.href = href;
        }, 280);
      }
    });

    el.addEventListener('blur', () => {
      el.removeAttribute('contenteditable');
      el.classList.remove('editor-active');
      recheckUnsaved();
    });

    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') {
        el.innerHTML = el.dataset.editorOriginal || '';
        e.preventDefault();
        el.blur();
      }
    });
  }

  function scanForParagraphEquivalents(nextId) {
    const blockTags = new Set([
      'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'div', 'section', 'article', 'ul', 'ol',
      'table', 'blockquote', 'pre', 'figure'
    ]);

    let id = nextId;
    const nodes = document.querySelectorAll('div, span');
    nodes.forEach(el => {
      if (el.dataset.editorId) return;

      let hasDirectText = false;
      for (const node of el.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          hasDirectText = true;
          break;
        }
      }
      if (!hasDirectText) return;

      const hasBlockChild = Array.from(el.children).some(child =>
        blockTags.has(child.tagName.toLowerCase())
      );
      if (hasBlockChild) return;
      if (!el.textContent.trim()) return;

      annotate(el, id, el.innerHTML);
      id += 1;
    });
  }

  function setupEditableHandlers(el) {
    el.addEventListener('focus', () => {
      el.classList.add('editor-active');
    });

    el.addEventListener('blur', () => {
      el.classList.remove('editor-active');
      if (state.suppressBlur) return;
      recheckUnsaved();
    });

    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        el.blur();
      }
      if (e.key === 'Escape') {
        el.innerHTML = el.dataset.editorOriginal || '';
        e.preventDefault();
        el.blur();
      }
    });
  }

  function recheckUnsaved() {
    const editables = document.querySelectorAll('[data-editor-id]');
    for (const el of editables) {
      const original = el.dataset.editorOriginal || '';
      const current = el.innerHTML;
      if (normalize(current) !== normalize(original)) {
        setUnsaved(true);
        return;
      }
    }
    setUnsaved(false);
  }

  function setUnsaved(val) {
    state.unsavedChanges = val;
    updateSaveBar();
  }

  function updateSaveBar() {
    const btn = document.querySelector('.editor-save-btn');
    const status = document.querySelector('.editor-save-status');
    if (!btn || !status) return;
    btn.disabled = !state.unsavedChanges;
    if (!state.unsavedChanges) {
      status.textContent = 'All changes saved';
    } else {
      status.textContent = 'Unsaved changes';
    }
  }

  function getMarkAncestor(node) {
    if (!node) return null;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return el ? el.closest('[data-llm]') : null;
  }

  function createToolbar() {
    const toolbar = document.createElement('div');
    toolbar.className = 'editor-toolbar';

    const boldBtn = document.createElement('button');
    boldBtn.type = 'button';
    boldBtn.textContent = 'B';

    const italicBtn = document.createElement('button');
    italicBtn.type = 'button';
    italicBtn.textContent = 'I';

    const markBtn = document.createElement('button');
    markBtn.type = 'button';
    markBtn.textContent = 'M';
    markBtn.className = 'editor-mark-btn';

    const unmarkBtn = document.createElement('button');
    unmarkBtn.type = 'button';
    unmarkBtn.textContent = '\u2715';
    unmarkBtn.className = 'editor-unmark-btn';
    unmarkBtn.hidden = true;

    toolbar.appendChild(boldBtn);
    toolbar.appendChild(italicBtn);
    toolbar.appendChild(markBtn);
    toolbar.appendChild(unmarkBtn);
    document.body.appendChild(toolbar);

    const preventMouseDown = (e) => e.preventDefault();
    boldBtn.addEventListener('mousedown', preventMouseDown);
    italicBtn.addEventListener('mousedown', preventMouseDown);
    markBtn.addEventListener('mousedown', preventMouseDown);
    unmarkBtn.addEventListener('mousedown', preventMouseDown);

    boldBtn.addEventListener('click', () => document.execCommand('bold'));
    italicBtn.addEventListener('click', () => document.execCommand('italic'));

    return toolbar;
  }

  function positionToolbar(toolbar, range) {
    const rect = range.getBoundingClientRect();
    const top = rect.top + window.scrollY - toolbar.offsetHeight - 8;
    const left = rect.left + window.scrollX + rect.width / 2 - toolbar.offsetWidth / 2;
    toolbar.style.top = `${Math.max(8, top)}px`;
    toolbar.style.left = `${Math.max(8, left)}px`;
  }

  function setupToolbarBehavior(toolbar) {
    const markBtn = toolbar.querySelector('.editor-mark-btn');
    const unmarkBtn = toolbar.querySelector('.editor-unmark-btn');
    let activePopup = null;

    function getEditableAncestor(node) {
      if (!node) return null;
      if (node.nodeType === Node.ELEMENT_NODE) {
        return node.closest('[data-editor-id]');
      }
      return node.parentElement ? node.parentElement.closest('[data-editor-id]') : null;
    }

    function closePopup() {
      if (activePopup) {
        activePopup.remove();
        activePopup = null;
      }
      state.suppressBlur = false;
    }

    function showToolbar(range) {
      toolbar.classList.add('editor-toolbar-visible');
      requestAnimationFrame(() => positionToolbar(toolbar, range));
    }

    function hideToolbar() {
      toolbar.classList.remove('editor-toolbar-visible');
    }

    document.addEventListener('selectionchange', () => {
      if (activePopup) return;

      const selection = document.getSelection();
      if (!selection || selection.rangeCount === 0) {
        hideToolbar();
        unmarkBtn.hidden = true;
        return;
      }

      const range = selection.getRangeAt(0);
      if (selection.isCollapsed) {
        hideToolbar();
        unmarkBtn.hidden = true;
        return;
      }

      const anchor = selection.anchorNode;
      const editableEl = getEditableAncestor(anchor);
      if (!editableEl || !editableEl.classList.contains('editor-editable')) {
        hideToolbar();
        unmarkBtn.hidden = true;
        return;
      }

      showToolbar(range);
      const inMark = !!getMarkAncestor(anchor);
      unmarkBtn.hidden = !inMark;
    });

    document.addEventListener('mouseup', () => {
      if (activePopup) return;

      const selection = document.getSelection();
      if (!selection || selection.isCollapsed) {
        hideToolbar();
        unmarkBtn.hidden = true;
      }
    });

    markBtn.addEventListener('click', () => {
      const selection = document.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return;

      const savedRange = selection.getRangeAt(0).cloneRange();
      closePopup();
      state.suppressBlur = true;

      const popup = document.createElement('div');
      popup.className = 'editor-mark-popup';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Instruction for LLM...';

      const applyBtn = document.createElement('button');
      applyBtn.type = 'button';
      applyBtn.textContent = 'Apply';

      popup.appendChild(input);
      popup.appendChild(applyBtn);
      document.body.appendChild(popup);
      activePopup = popup;

      const rect = savedRange.getBoundingClientRect();
      popup.style.top = (rect.bottom + window.scrollY + 6) + 'px';
      popup.style.left = (rect.left + window.scrollX) + 'px';

      popup.addEventListener('mousedown', (e) => {
        if (e.target !== input) e.preventDefault();
      });

      input.focus();

      function applyMark() {
        const instruction = input.value.trim();
        if (!instruction) { closePopup(); return; }

        const sel = document.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);

        const span = document.createElement('span');
        span.setAttribute('data-llm', instruction);
        try {
          savedRange.surroundContents(span);
        } catch (err) {
          const fragment = savedRange.extractContents();
          span.appendChild(fragment);
          savedRange.insertNode(span);
        }

        closePopup();
        sel.removeAllRanges();
        recheckUnsaved();
      }

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); applyMark(); }
        if (e.key === 'Escape') { e.preventDefault(); closePopup(); }
      });

      applyBtn.addEventListener('click', applyMark);
    });

    unmarkBtn.addEventListener('click', () => {
      const selection = document.getSelection();
      if (!selection) return;
      const span = getMarkAncestor(selection.anchorNode);
      if (span) {
        const parent = span.parentNode;
        while (span.firstChild) {
          parent.insertBefore(span.firstChild, span);
        }
        parent.removeChild(span);
        parent.normalize();
      }
      unmarkBtn.hidden = true;
      recheckUnsaved();
    });

    document.addEventListener('click', (e) => {
      const markSpan = e.target.closest('[data-llm]');
      if (markSpan && markSpan.closest('[data-editor-id]')) {
        e.stopPropagation();
        closePopup();
        state.suppressBlur = true;
        hideToolbar();

        const popup = document.createElement('div');
        popup.className = 'editor-mark-popup';

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Instruction for LLM...';
        input.value = markSpan.getAttribute('data-llm') || '';

        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.textContent = 'Apply';

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.textContent = '\u2715';
        removeBtn.className = 'editor-unmark-btn';
        removeBtn.title = 'Remove mark';

        popup.appendChild(input);
        popup.appendChild(applyBtn);
        popup.appendChild(removeBtn);
        document.body.appendChild(popup);
        activePopup = popup;

        const rect = markSpan.getBoundingClientRect();
        popup.style.top = (rect.bottom + window.scrollY + 6) + 'px';
        popup.style.left = (rect.left + window.scrollX) + 'px';

        popup.addEventListener('mousedown', (ev) => {
          if (ev.target !== input) ev.preventDefault();
        });

        input.focus();
        input.select();

        function applyEdit() {
          const instruction = input.value.trim();
          if (instruction) {
            markSpan.setAttribute('data-llm', instruction);
            recheckUnsaved();
          }
          closePopup();
        }

        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); applyEdit(); }
          if (ev.key === 'Escape') { ev.preventDefault(); closePopup(); }
        });

        applyBtn.addEventListener('click', applyEdit);

        removeBtn.addEventListener('click', () => {
          const parent = markSpan.parentNode;
          while (markSpan.firstChild) {
            parent.insertBefore(markSpan.firstChild, markSpan);
          }
          parent.removeChild(markSpan);
          parent.normalize();
          closePopup();
          recheckUnsaved();
        });
        return;
      }

      if (!e.target.closest('[data-editor-id]') && !e.target.closest('.editor-mark-popup') && !e.target.closest('.editor-toolbar')) {
        hideToolbar();
        closePopup();
      }
    });
  }

  function createSaveBar() {
    const bar = document.createElement('div');
    bar.className = 'editor-save-bar';

    const status = document.createElement('div');
    status.className = 'editor-save-status';
    status.textContent = 'All changes saved';

    const button = document.createElement('button');
    button.className = 'editor-save-btn';
    button.type = 'button';
    button.textContent = 'Save';
    button.disabled = true;

    bar.appendChild(status);
    bar.appendChild(button);
    document.body.appendChild(bar);

    button.addEventListener('click', () => {
      function cleanInnerHTML(el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('[data-editor-id]').forEach(child => {
          child.removeAttribute('data-editor-id');
          child.removeAttribute('data-editor-original');
          child.removeAttribute('contenteditable');
          child.classList.remove('editor-editable', 'editor-active');
          if (!child.getAttribute('class')) child.removeAttribute('class');
        });
        return clone.innerHTML;
      }

      const changes = {};
      document.querySelectorAll('[data-editor-id]').forEach(el => {
        const original = el.dataset.editorOriginal || '';
        const current = cleanInnerHTML(el);
        if (normalize(current) !== normalize(original)) {
          changes[el.dataset.editorId] = current;
        }
      });
      if (Object.keys(changes).length === 0) return;
      fetch('/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changes })
      }).then(res => {
        if (!res.ok) throw new Error('Save failed');
        return res.json();
      }).then(() => {
        document.querySelectorAll('[data-editor-id]').forEach(el => {
          el.dataset.editorOriginal = el.innerHTML;
        });
        status.textContent = 'Saved \u2713';
        setTimeout(() => setUnsaved(false), 2000);
      }).catch(err => {
        status.textContent = err.message || 'Error saving';
        button.disabled = false;
      });
    });
  }

  function setupBeforeUnload() {
    window.addEventListener('beforeunload', (e) => {
      if (!state.unsavedChanges) return;
      e.preventDefault();
      e.returnValue = '';
    });
  }

  function init() {
    const map = window.EDITOR_MAP || [];
    let annotated = 0;
    map.forEach(entry => {
      const el = findElement(entry);
      if (el) {
        annotate(el, entry.id, entry.innerHTML);
        annotated += 1;
      }
    });
    scanForParagraphEquivalents(map.length);
    const toolbar = createToolbar();
    setupToolbarBehavior(toolbar);
    createSaveBar();
    setupBeforeUnload();
    console.log('[Editor] Annotated:', annotated, '/', map.length);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
