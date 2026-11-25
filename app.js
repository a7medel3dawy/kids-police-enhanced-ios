(() => {
  const byId = (id) => document.getElementById(id);
  const game = byId('game');
  const launchIntro = byId('launch-intro');
  const launchArtwork = document.querySelector('link[rel="preload"][as="image"]');
  if (window.Capacitor?.getPlatform() === 'android') {
    launchIntro.hidden = true;
  } else if (window.matchMedia(launchArtwork.media).matches) {
    const image = new Image();
    image.src = launchArtwork.href;
    image.decode().then(() => {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        if (getComputedStyle(launchIntro).visibility === 'visible') launchIntro.classList.add('is-playing');
      }));
    }).catch(() => { launchIntro.hidden = true; });
  }

  const reasons = byId('reason-choices');
  const keypad = byId('keypad');
  const keypadDisplay = byId('keypad-display');
  const feedback = byId('call-feedback');
  const audioRetry = byId('audio-retry');
  const testOptions = byId('test-options');
  const testStatus = byId('test-ad-status');
  const privacyChoices = byId('test-privacy-choices');
  const media = new Audio();
  const { effects } = gameContent.audio;
  const selectionSound = new Audio(effects.select);
  const run = { screen: 'home', locale: 'eg', reason: 'listening', line: 0, step: null };
  const call = { next: 0, clock: 0, start: 0, sound: null, audioRequest: 0, track: '', muted: false, micMuted: false, completed: false };
  const icon = (name) => '<svg class="icon" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  const monetization = window.Capacitor?.isNativePlatform?.() && typeof createTestMonetization === 'function' ? createTestMonetization({
    capacitor: window.Capacitor,
    storage: window.localStorage,
    isHome: () => run.screen === 'home',
    isOnline: () => navigator.onLine,
    status: message => {
      testStatus.textContent = message;
      privacyChoices.hidden = !monetization.privacyOptionsRequired();
    },
  }) : null;

  if (monetization) {
    const optionsButton = byId('open-test-options');
    const adsToggle = byId('test-ads');
    const analyticsToggle = byId('test-analytics');
    optionsButton.hidden = false;
    optionsButton.addEventListener('click', () => {
      privacyChoices.hidden = !monetization.privacyOptionsRequired();
      testOptions.showModal();
    });
    adsToggle.checked = monetization.adsOptIn;
    analyticsToggle.checked = monetization.analyticsOptIn;
    const startAds = () => monetization.updateAds(adsToggle.checked).catch(() => {
      testStatus.textContent = 'تعذّر تجهيز إعلان الاختبار. المكالمات متاحة.';
    });
    adsToggle.addEventListener('change', startAds);
    analyticsToggle.addEventListener('change', () => {
      monetization.updateAnalytics(analyticsToggle.checked).catch(() => {
        testStatus.textContent = 'تعذّر تغيير إعداد القياس. المكالمات متاحة.';
      });
    });
    privacyChoices.addEventListener('click', () => {
      monetization.showPrivacyOptions().catch(() => {
        testStatus.textContent = 'خيارات خصوصية الإعلانات غير متاحة الآن.';
      });
    });
    if (adsToggle.checked) void startAds();
    if (analyticsToggle.checked) void monetization.updateAnalytics(true).catch(() => {});
    window.addEventListener('online', () => { if (adsToggle.checked) void startAds(); });
  }

  function renderReasons() {
    reasons.replaceChildren();
    for (const reason of gameContent.reasons) {
      const card = document.createElement('label');
      card.className = 'choice reason-card';
      card.innerHTML = '<input type="radio" name="reason"><img class="reason-icon" alt=""><span></span><span class="tick" aria-hidden="true">' + icon('check') + '</span>';
      const input = card.querySelector('input');
      input.value = reason.id;
      input.checked = run.reason === reason.id;
      card.querySelector('.reason-icon').src = 'assets/art/reason-' + reason.id + '.webp';
      card.children[2].textContent = reason.labels[run.locale];
      reasons.append(card);
    }
  }

  function stopAudio() {
    call.audioRequest += 1;
    call.track = '';
    audioRetry.hidden = true;
    media.onended = null;
    if (call.sound) {
      call.sound.pause();
      call.sound = null;
    }
  }

  function playEffect(effect, volume) {
    effect.currentTime = 0;
    effect.volume = volume;
    effect.play().catch(() => {});
  }

  function playAudio(path, { loop = false, volume = 1, onComplete, retry = true } = {}) {
    stopAudio();
    if (!path) return;
    const request = call.audioRequest;
    call.track = path;
    call.sound = media;
    media.src = path;
    media.loop = loop;
    media.volume = volume;
    media.muted = call.muted;
    media.onended = onComplete ? () => {
      if (call.audioRequest === request) onComplete();
    } : null;
    media.play().catch((error) => {
      if (call.audioRequest !== request) return;
      audioRetry.hidden = !retry || error.name !== 'NotAllowedError' || run.screen !== 'talk';
      feedback.textContent = audioRetry.hidden
        ? 'الصوت غير متاح. المحاكاة مكملة على الشاشة.'
        : 'اضغط تشغيل الصوت لسماع التسجيل.';
      if (audioRetry.hidden) onComplete?.();
    });
  }

  function stopClock() {
    clearTimeout(call.next);
    clearInterval(call.clock);
    call.next = 0;
    call.clock = 0;
  }

  function updateClock() {
    const seconds = Math.floor((performance.now() - call.start) / 1000);
    const stamp = [Math.floor(seconds / 60), seconds % 60]
      .map((part) => String(part).padStart(2, '0')).join(':');
    byId('call-time').textContent = stamp;
    byId('talk-time').textContent = stamp;
  }

  function updateCallButtons() {
    for (const button of game.querySelectorAll('[data-control="speaker"]')) {
      button.setAttribute('aria-pressed', String(call.muted));
      button.setAttribute('aria-label', call.muted ? 'تشغيل صوت المكالمة' : 'كتم صوت المكالمة');
      button.innerHTML = icon(call.muted ? 'mute' : 'sound');
    }
    for (const button of game.querySelectorAll('[data-control="mic"]')) {
      button.setAttribute('aria-pressed', String(call.micMuted));
      button.setAttribute('aria-label', call.micMuted ? 'تشغيل الميكروفون التمثيلي' : 'كتم الميكروفون التمثيلي');
      button.innerHTML = icon(call.micMuted ? 'mic-off' : 'mic');
    }
  }

  function resetCall() {
    stopClock();
    stopAudio();
    call.muted = false;
    call.micMuted = false;
    call.completed = false;
    run.line = 0;
    run.step = null;
    feedback.textContent = '';
    if (keypad.open) keypad.close();
    updateCallButtons();
  }

  const parentCall = () => gameContent.audio.parentCalls?.[run.locale]?.[run.reason];
  const followUp = { opening: 'request', request: 'check' };

  function completeCall() {
    if (call.completed) return;
    call.completed = true;
    monetization?.completeCall();
  }

  function showResponseButtons(step) {
    byId('recorded-next').hidden = !followUp[step];
    byId('recorded-quiet').hidden = step !== 'check' && step !== 'calm';
    byId('recorded-loud').hidden = step !== 'check';
    byId('recorded-end').hidden = step !== 'calm';
    byId('recorded-actions').hidden = false;
    if (step === 'calm') {
      byId('recorded-status').textContent = 'خدوا وقتكم. اختار الرد، أو انهوا المكالمة وجربوا بعدين.';
    } else {
      byId('recorded-status').textContent = followUp[step] ? 'دورك تتكلم' : 'اختار حسب رد الطفل.';
    }
  }

  function finishCall(agreed) {
    byId('success').dataset.outcome = agreed ? 'agreed' : 'paused';
    byId('success-title').textContent = agreed ? 'اتفقنا يا بطل!' : 'نكمل وقت تاني';
    byId('success-message').textContent = agreed ? 'شكرًا لتعاونك.' : 'ممكن تاخدوا لحظة وترجعوا تجربوا بهدوء لما تكونوا جاهزين.';
    show('success');
  }

  function playParentStep(step) {
    run.step = step;
    const file = parentCall()[step === 'calm' ? 'request' : step];
    byId('recorded-status').textContent = step === 'calm' ? 'نجرب بهدوء' : gameContent.officers[run.locale].name + ' على الخط';
    byId('recorded-actions').hidden = true;
    playAudio(file, {
      onComplete() {
        if (step === 'quiet') finishCall(true);
        else showResponseButtons(step);
      },
    });
  }


  function showTalk() {
    const officer = gameContent.officers[run.locale];
    const talk = byId('talk');
    talk.dataset.officer = officer.art;
    const recorded = parentCall();
    byId('speech').hidden = Boolean(recorded);
    byId('recorded-dialogue').hidden = !recorded;
    if (recorded) {
      byId('recorded-quiet').textContent = recorded.quietLabel;
      talk.dataset.pose = 'point';
      playParentStep('opening');
      return;
    }
    talk.dataset.pose = run.line === 0 ? 'point' : 'approve';
    byId('speech-text').textContent = gameContent.dialogue[run.locale][run.reason][run.line];
    byId('speech-action').textContent = run.line === 0 ? 'متابعة' : 'اتفقنا';
    const recordings = gameContent.audio.calls[run.locale][run.reason];
    playAudio(recordings?.[run.line]);
  }

  function show(id) {
    const previous = run.screen;
    if (previous === id) return;
    const continuingCall = previous === 'voice' && id === 'talk';
    const wasInCall = previous === 'connecting' || previous === 'voice' || previous === 'talk';
    if (previous === 'success' || (previous === 'reason' && id !== 'connecting')) stopAudio();
    if (wasInCall && !continuingCall) {
      stopClock();
      stopAudio();
      if (keypad.open) keypad.close();
    }

    const screen = byId(id);
    byId(previous).hidden = true;
    screen.hidden = false;
    run.screen = id;
    game.dataset.current = id;
    window.scrollTo(0, 0);

    if (id === 'reason') {
      const family = game.querySelector('[name="dialect-family"]:checked').value;
      run.locale = family === 'egyptian' ? 'eg' : game.querySelector('[name="gulf-dialect"]:checked').value;
      const officer = gameContent.officers[run.locale];
      screen.dataset.officer = officer.art;
      byId('reason-officer').textContent = officer.name;
      renderReasons();
      if (wasInCall) playAudio(effects.hangup, { volume: 0.65 });
    }

    if (id === 'connecting') {
      resetCall();
      monetization?.startCall();
      const officer = gameContent.officers[run.locale];
      const art = officer.art;
      byId('connecting-officer').textContent = officer.name;
      for (const pose of ['point', 'approve']) {
        const preload = new Image();
        preload.src = 'assets/art/' + art + '-' + pose + '.webp';
      }
      selectionSound.pause();
      playAudio(gameContent.audio.ringtone, { loop: true, volume: 0.8 });
      call.next = setTimeout(() => show('voice'), 2450);
    }

    if (id === 'voice') {
      const officer = gameContent.officers[run.locale];
      screen.dataset.officer = officer.art;
      byId('voice-title').textContent = officer.name;
      const hasRecording = parentCall() || gameContent.audio.calls[run.locale][run.reason]?.some(Boolean);
      byId('voice-hint').textContent = hasRecording ? 'المكالمة بدأت' : 'المكالمة بدأت · الحوار مكتوب';
      playAudio(effects.connect, { volume: 0.42 });
      call.start = performance.now();
      updateClock();
      call.clock = setInterval(updateClock, 250);
      call.next = setTimeout(() => {
        // Let callers finish using the keypad before switching scenes.
        if (keypad.open) {
          keypad.addEventListener('close', () => {
            if (run.screen === 'voice') show('talk');
          }, { once: true });
        } else {
          show('talk');
        }
      }, 2700);
    }

    if (id === 'talk') showTalk();
    if (id === 'success') {
      completeCall();
      if (screen.dataset.outcome === 'agreed') playAudio(effects.success, { volume: 0.72 });
      else playAudio(effects.hangup, { volume: 0.65 });
    }
    if (id === 'home') {
      monetization?.returnHome(call.completed);
      call.completed = false;
    }
    screen.querySelector('h1, h2').focus({ preventScroll: true });
  }

  const controls = [
    ['speaker', 'كتم صوت المكالمة', 'sound'],
    ['mic', 'كتم الميكروفون التمثيلي', 'mic'],
    ['keypad', 'لوحة أرقام تمثيلية', 'dots'],
    ['end', 'إنهاء المكالمة', 'end'],
  ];

  for (const container of [byId('voice-controls'), byId('talk-controls')]) {
    for (const [control, label, symbol] of controls) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'call-control control-' + control;
      button.dataset.control = control;
      button.setAttribute('aria-label', label);
      if (control === 'speaker' || control === 'mic') button.setAttribute('aria-pressed', 'false');
      if (control === 'keypad') button.setAttribute('aria-haspopup', 'dialog');
      button.innerHTML = icon(symbol);
      container.append(button);
    }
  }

  for (const key of '123456789*0#') {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.digit = key;
    button.textContent = key;
    byId('number-keys').append(button);
  }

  const backFromReason = () => run.locale === 'eg' ? 'dialect' : 'gulf';

  game.addEventListener('change', (event) => {
    if (event.target.type !== 'radio' || !event.target.checked) return;
    if (event.target.name === 'reason') run.reason = event.target.value;
    playEffect(selectionSound, 0.32);
  });

  game.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button) return;

    if (button.dataset.go) {
      if (run.screen === 'home' && monetization?.showing()) return;
      show(button.dataset.go);
      return;
    }
    if (button.dataset.digit) {
      keypadDisplay.value = (keypadDisplay.value + button.dataset.digit).slice(0, 16);
      return;
    }
    if (button.dataset.control === 'speaker') {
      call.muted = !call.muted;
      if (call.sound) call.sound.muted = call.muted;
      updateCallButtons();
    }
    if (button.dataset.control === 'mic') {
      call.micMuted = !call.micMuted;
      updateCallButtons();
      feedback.textContent = 'الميكروفون جزء من المحاكاة.';
    }
    if (button.dataset.control === 'keypad') keypad.showModal();
    if (button.dataset.control === 'end') show('reason');

    if (button.id === 'close-keypad') keypad.close();
    if (button.id === 'clear-keypad') keypadDisplay.value = '';
    if (button.id === 'confirm-dialect') {
      const selection = game.querySelector('[name="dialect-family"]:checked').value;
      show(selection === 'egyptian' ? 'reason' : 'gulf');
    }
    if (button.id === 'back-from-reason') show(backFromReason());
    if (button.id === 'audio-retry') {
      if (run.step) playParentStep(run.step);
      else playAudio(call.track);
    }
    if (button.dataset.recordedAction) {
      const action = button.dataset.recordedAction;
      if (action === 'end') {
        if (run.step === 'calm' && !button.hidden) finishCall(false);
      }
      else if (action === 'next') playParentStep(followUp[run.step]);
      else playParentStep(action);
      return;
    }
    if (button.id === 'speech') {
      if (run.line === 1) {
        finishCall(true);
      } else {
        run.line = 1;
        showTalk();
      }
    }
  });

  keypad.addEventListener('close', () => { keypadDisplay.value = ''; });

  function goBack() {
    if (testOptions?.open) {
      testOptions.close();
      return true;
    }
    if (keypad.open) {
      keypad.close();
      return true;
    }
    const back = {
      dialect: 'home', gulf: 'dialect', reason: backFromReason(), connecting: 'reason',
      voice: 'reason', talk: 'reason', success: 'home',
    };
    const previous = back[run.screen];
    if (!previous) return false;
    show(previous);
    return true;
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !event.defaultPrevented && goBack()) event.preventDefault();
  });

  const nativeApp = window.Capacitor?.Plugins?.App;
  nativeApp?.addListener('backButton', ({ canGoBack }) => {
    if (goBack()) return;
    if (canGoBack) window.history.back();
    else nativeApp.exitApp();
  });
})();
