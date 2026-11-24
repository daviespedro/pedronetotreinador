const config = window.consultoriaConfig;
const menuButton = document.querySelector('.nav-toggle');
const menu = document.getElementById('menu');
menu.closest('.navigation').classList.add('menu-ready');

function closeMenu() {
  menuButton.setAttribute('aria-expanded', 'false');
  menu.classList.remove('open');
}

menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  menu.classList.toggle('open', open);
});
menu.addEventListener('click', (event) => {
  if (event.target.closest('a')) closeMenu();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && menu.classList.contains('open')) {
    closeMenu();
    menuButton.focus();
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.navigation')) closeMenu();
});

const phone = config.whatsapp.replace(/\D/g, '');
if (/^[1-9]\d{9,14}$/.test(phone)) {
  document.querySelectorAll('[data-whatsapp]').forEach((link) => {
    const message = link.dataset.plan
      ? `Olá, Pedro! Tenho interesse no plano ${link.dataset.plan} da consultoria online.`
      : config.mensagem;
    link.href = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  });
  const contactStatus = document.getElementById('contact-status');
  contactStatus.textContent = 'Atendimento direto com Pedro pelo WhatsApp.';
  contactStatus.hidden = false;
} else {
  document.querySelector('.whatsapp-float').setAttribute('aria-label', 'Ver opções de contato com Pedro Neto');
}

const consultationDialog = document.getElementById('consultation-dialog');
const consultationForm = document.getElementById('consultation-form');
const nameInput = document.getElementById('consultation-name');
let selectedPlan = '';

document.querySelectorAll('[data-plan]').forEach((link) => {
  link.setAttribute('aria-haspopup', 'dialog');
  link.addEventListener('click', (event) => {
    event.preventDefault();
    selectedPlan = link.dataset.plan;
    const price = config.planos[selectedPlan.toLowerCase()].valor;
    document.getElementById('selected-plan').textContent = `Plano ${selectedPlan} · ${price}`;
    consultationDialog.showModal();
    nameInput.focus();
  });
});

consultationDialog.querySelector('.dialog-close').addEventListener('click', () => {
  consultationDialog.close();
});
nameInput.addEventListener('input', () => nameInput.setCustomValidity(''));
consultationForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.setCustomValidity('Informe seu nome.');
    nameInput.reportValidity();
    return;
  }
  if (!consultationForm.reportValidity()) return;
  const price = config.planos[selectedPlan.toLowerCase()].valor;
  const message = [
    'Olá, Pedro! Quero começar minha consultoria online.',
    '',
    `Plano escolhido: ${selectedPlan} (${price})`,
    `Nome: ${name}`,
    `Sexo: ${consultationForm.elements.sexo.value}`,
    `Idade: ${consultationForm.elements.idade.value} anos`,
    '',
    'Como faço para contratar?',
  ].join('\n');
  window.location.assign(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`);
});

document.querySelector('[data-formation]').textContent = config.formacao;
if (config.cref) {
  const registration = document.querySelector('[data-cref]');
  registration.textContent = config.cref;
  registration.hidden = false;
}

for (const [key, plan] of Object.entries(config.planos)) {
  if (plan.valor) document.querySelector(`[data-price="${key}"]`).textContent = plan.valor;
  if (!plan.beneficios) continue;
  const list = document.querySelector(`[data-benefits="${key}"]`);
  list.replaceChildren(...plan.beneficios.map((benefit) => {
    const item = document.createElement('li');
    item.textContent = benefit;
    return item;
  }));
}

for (const [selector, value] of [
  ['[data-bio]', config.biografia],
  ['[data-method]', config.metodologia],
]) {
  if (value) document.querySelector(selector).textContent = value;
}

const results = document.querySelector('[data-results]');
const resultTemplate = document.getElementById('result-template');
const cards = config.resultados.flatMap(({ nome, antes, depois, relato, avatar, montagem }) => {
  const hasPhotos = Boolean(montagem || (antes && depois));
  if (!hasPhotos && !relato) return [];

  const card = resultTemplate.content.firstElementChild.cloneNode(true);
  const comparison = card.querySelector('.result-slot');
  const testimonial = card.querySelector('[data-testimonial]');

  if (hasPhotos) {
    if (montagem) {
      comparison.querySelector('.comparison').classList.add('comparison-art');
      card.classList.add('photo-result');
    }
    comparison.querySelector('[data-result-name]').textContent = nome || '';
    for (const [key, source, label] of [['before', antes, 'Antes'], ['after', depois, 'Depois']]) {
      const photo = comparison.querySelector(`[data-${key}]`);
      photo.alt = nome ? `${label} do acompanhamento de ${nome}` : `${label} do acompanhamento`;
      photo.src = montagem || source;
    }
  } else {
    comparison.remove();
  }

  if (relato) {
    testimonial.querySelector('blockquote p').textContent = relato;
    testimonial.querySelector('[data-author]').textContent = nome || 'Aluno da consultoria';
    if (avatar) {
      const photo = testimonial.querySelector('[data-avatar]');
      photo.addEventListener('error', () => { photo.hidden = true; }, { once: true });
      photo.src = avatar;
      photo.hidden = false;
    }
  } else {
    testimonial.remove();
  }
  return [card];
});
const resultsDialog = document.getElementById('results-dialog');
const expandIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 3l6 6m12-6-6 6M3 21l6-6m12 6-6-6"/></svg>';
cards.forEach((card) => {
  if (!card.classList.contains('photo-result')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'result-expand';
  button.setAttribute('aria-haspopup', 'dialog');
  button.innerHTML = 'Ampliar comparação' + expandIcon;
  button.addEventListener('click', () => {
    const figure = card.querySelector('.result-slot').cloneNode(true);
    figure.querySelector('.result-expand').remove();
    figure.querySelector('figcaption').remove();
    document.querySelector('[data-expanded-result]').replaceChildren(figure);
    resultsDialog.showModal();
  });
  card.querySelector('.result-slot').append(button);
});
resultsDialog.querySelector('.dialog-close').addEventListener('click', () => {
  resultsDialog.close();
});

if (cards.length) {
  results.replaceChildren(...cards);
}

// Revela cada item uma vez, sem ocultar conteúdo quando JavaScript ou motion estão indisponíveis.
const revealGroups = [...document.querySelectorAll('.included-grid, .steps, .pillar-grid, .marker-grid')];
const revealDelays = new Map();
revealGroups.forEach((group) => {
  [...group.children].forEach((card, index) => revealDelays.set(card, index * 90));
});
const motionPreference = window.matchMedia('(prefers-reduced-motion: no-preference)');
if ('IntersectionObserver' in window && 'animate' in Element.prototype) {
  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      revealObserver.unobserve(target);
      if (!motionPreference.matches) return;
      const delay = revealDelays.get(target) || 0;
      target.animate(
        [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
        { duration: 450, delay, fill: 'backwards', easing: 'cubic-bezier(.16, 1, .3, 1)' },
      );
    });
  }, { threshold: 0.15 });
  document.querySelectorAll('.included-card, .process-section .method-step, .pillar, .marker, .plan, .result-card').forEach((item) => {
    revealObserver.observe(item);
  });
}

// O menu acompanha a seção em leitura.
if ('IntersectionObserver' in window) {
  const sectionLinks = [...document.querySelectorAll('.nav-links a[href^="#"]:not([data-whatsapp])')];
  const navigationObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      sectionLinks.forEach((link) => {
        if (link.hash === '#' + target.id) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    });
  }, { rootMargin: '-15% 0px -65% 0px' });
  sectionLinks.forEach((link) => navigationObserver.observe(document.querySelector(link.hash)));
}

// Contagem apenas do indicador numérico existente.
if ('IntersectionObserver' in window) {
  const counterObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ isIntersecting, target }) => {
      if (!isIntersecting) return;
      counterObserver.unobserve(target);
      if (!motionPreference.matches) return;
      const finalValue = Number(target.dataset.counter);
      const prefix = target.dataset.prefix || '';
      const start = performance.now();
      function updateCounter(now) {
        const progress = Math.min((now - start) / 900, 1);
        const value = Math.round(finalValue * (1 - Math.pow(1 - progress, 3)));
        target.textContent = prefix + value;
        if (progress < 1 && motionPreference.matches) {
          requestAnimationFrame(updateCounter);
        } else {
          target.textContent = prefix + finalValue;
        }
      }
      requestAnimationFrame(updateCounter);
    });
  }, { threshold: .6 });
  document.querySelectorAll('[data-counter]').forEach((counter) => counterObserver.observe(counter));

  const loopObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      target.classList.toggle('motion-visible', isIntersecting);
    });
  });
  document.querySelectorAll('.consultation-marquee, .plan-featured').forEach((element) => loopObserver.observe(element));

  const hero = document.getElementById('inicio');
  const mobileCta = document.querySelector('.mobile-cta');
  const heroObserver = new IntersectionObserver(() => {
    const pastHero = hero.getBoundingClientRect().bottom <= 0;
    mobileCta.classList.toggle('is-visible', pastHero);
    mobileCta.inert = !pastHero;
    document.body.classList.toggle('past-hero', pastHero);
  });
  heroObserver.observe(hero);
}

// Mantém o comportamento nativo do FAQ quando o movimento está reduzido.
document.querySelectorAll('.questions details').forEach((details) => {
  const summary = details.querySelector('summary');
  let animation;
  let opening = details.open;
  summary.addEventListener('click', (event) => {
    if (!motionPreference.matches || !details.animate) return;
    event.preventDefault();
    const startHeight = details.getBoundingClientRect().height;
    opening = animation ? !opening : !details.open;
    animation?.cancel();
    details.open = true;
    const styles = getComputedStyle(details);
    const collapsedHeight = summary.offsetHeight + parseFloat(styles.paddingTop)
      + parseFloat(styles.paddingBottom) + parseFloat(styles.borderTopWidth)
      + parseFloat(styles.borderBottomWidth);
    const endHeight = opening ? details.getBoundingClientRect().height : collapsedHeight;
    details.style.overflow = 'hidden';
    details.classList.toggle('is-closing', !opening);
    animation = details.animate(
      [{ height: startHeight + 'px' }, { height: endHeight + 'px' }],
      { duration: 260, easing: 'ease-out' },
    );
    animation.onfinish = () => {
      details.open = opening;
      details.style.overflow = '';
      details.classList.remove('is-closing');
      animation = null;
    };
  });
  motionPreference.addEventListener('change', () => {
    if (!motionPreference.matches) animation?.finish();
  });
});

// Interrompe efeitos contínuos quando a aba fica em segundo plano.
document.addEventListener('visibilitychange', () => {
  document.body.classList.toggle('motion-paused', document.hidden);
});
