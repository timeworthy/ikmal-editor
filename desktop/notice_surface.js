// Shared, action-oriented notice surface for the compact and full editors.
(function () {
  function attach(root) {
    function hide() {
      root.replaceChildren();
      root.classList.add('is-hidden');
    }

    function show({ message, title = '', error = false, details = '', actions = [] }) {
      root.replaceChildren();
      root.classList.remove('is-hidden');
      root.classList.toggle('is-error', Boolean(error));

      const body = document.createElement('div');
      body.className = 'notice-body';
      if (title) {
        const heading = document.createElement('strong');
        heading.textContent = title;
        body.appendChild(heading);
      }
      const text = document.createElement('p');
      text.textContent = message || '';
      body.appendChild(text);
      if (details) {
        const disclosure = document.createElement('details');
        disclosure.className = 'notice-details';
        const summary = document.createElement('summary');
        summary.textContent = 'Details';
        const pre = document.createElement('pre');
        pre.textContent = details;
        disclosure.append(summary, pre);
        body.appendChild(disclosure);
      }
      root.appendChild(body);

      const usableActions = Array.isArray(actions) ? actions.filter((action) => action && action.label) : [];
      if (!usableActions.length) return;
      const actionBar = document.createElement('div');
      actionBar.className = 'notice-actions';
      usableActions.forEach((action) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `button ${action.kind === 'primary' ? 'button-primary' : 'button-quiet'}`;
        button.textContent = action.label;
        button.addEventListener('click', async () => {
          if (action.dismiss !== false) hide();
          button.disabled = true;
          try {
            await action.onClick?.();
          } finally {
            button.disabled = false;
          }
        });
        actionBar.appendChild(button);
      });
      root.appendChild(actionBar);
    }

    return { hide, show };
  }

  window.IkmalNoticeSurface = { attach };
})();
