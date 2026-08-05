/**
 * SCORM / Teach on Mars bridge — vanilla JS, sans dépendance.
 *
 * Détecte automatiquement la plateforme d'hébergement (Teach on Mars,
 * SCORM 2004, SCORM 1.2) en remontant la chaîne parent/opener, et expose
 * une API unifiée pour suivre la progression : window.ScormBridge.
 *
 * Inspiré du driver de github.com/luxmodernis/template-scorm-project,
 * réécrit en vanilla pour s'intégrer à cette app sans étape de build.
 *
 * Hors LMS (test en local ou sur Vercel), toutes les méthodes sont des
 * no-op silencieux : l'app fonctionne normalement, rien n'est envoyé.
 */
(function () {
  'use strict';

  function findToM() {
    if (window.ToM) return window.ToM;
    try { if (window.top && window.top.ToM) return window.top.ToM; } catch (e) {}
    return null;
  }

  function findScormAPI(propName) {
    var win = window;
    var level = 0;
    while (win && level < 500) {
      try {
        if (win[propName]) return win[propName];
        if (win === win.parent) break;
        win = win.parent;
      } catch (e) { break; }
      level++;
    }
    try {
      var opener = window.opener || null;
      var openerLevel = 0;
      while (opener && openerLevel < 500) {
        if (opener[propName]) return opener[propName];
        if (opener === opener.parent) break;
        opener = opener.parent;
        openerLevel++;
      }
    } catch (e) {}
    return null;
  }

  /* ===========================
     DRIVERS
     =========================== */

  function createToMDriver(api) {
    return {
      type: 'tom',
      initialize: function () {
        try { api.data.init(); return true; } catch (e) { return false; }
      },
      // data.send() crée un nouveau "launch" à chaque appel — ne l'appeler
      // qu'une seule fois, dans terminate(), jamais après chaque étape.
      // commit() est donc un no-op pour ToM.
      commit: function () { return true; },
      terminate: function () {
        try {
          api.data.send();   // un seul envoi = un seul launch
          api.utils.close();
          return true;
        } catch (e) { return false; }
      },
      setProgress: function (ratio) {
        // ToM attend un entier 0-100, pas un float 0-1
        try {
          var value = Math.round(ratio * 100);
          var current = api.data.get('progress') || 0;
          if (value > current) api.data.set('progress', value);
          return true;
        } catch (e) { return false; }
      },
      setCompleted: function () {
        try {
          api.data.set('progress', 100);
          api.data.set('success', true);
          api.data.set('score', 100);
          return true;
        } catch (e) { return false; }
      },
      // Clé libre côté ToM (même mécanisme que 'progress') — sert à
      // reprendre la partie là où l'utilisateur l'a quittée.
      setSuspendData: function (str) {
        try { api.data.set('suspend_data', str); return true; } catch (e) { return false; }
      },
      getSuspendData: function () {
        try { return api.data.get('suspend_data') || ''; } catch (e) { return ''; }
      },
    };
  }

  function createScorm12Driver(api) {
    return {
      type: 'scorm12',
      initialize: function () {
        return api.LMSInitialize('') === 'true';
      },
      terminate: function () {
        return api.LMSFinish('') === 'true';
      },
      commit: function () {
        return api.LMSCommit('') === 'true';
      },
      setProgress: function (ratio) {
        var percent = Math.round(ratio * 100);
        var r1 = api.LMSSetValue('cmi.core.score.raw', String(percent));
        var r2 = api.LMSSetValue('cmi.core.score.max', '100');
        var r3 = api.LMSSetValue('cmi.core.score.min', '0');
        var r4 = api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
        return r1 === 'true' && r2 === 'true' && r3 === 'true' && r4 === 'true';
      },
      setCompleted: function () {
        var r1 = api.LMSSetValue('cmi.core.score.raw', '100');
        var r2 = api.LMSSetValue('cmi.core.lesson_status', 'completed');
        return r1 === 'true' && r2 === 'true';
      },
      // cmi.suspend_data : champ texte libre (4096 car. max en SCORM 1.2)
      // prévu pour reprendre une session interrompue.
      setSuspendData: function (str) {
        return api.LMSSetValue('cmi.suspend_data', str) === 'true';
      },
      getSuspendData: function () {
        return api.LMSGetValue('cmi.suspend_data') || '';
      },
    };
  }

  function createScorm2004Driver(api) {
    return {
      type: 'scorm2004',
      initialize: function () {
        return api.Initialize('') === 'true';
      },
      terminate: function () {
        return api.Terminate('') === 'true';
      },
      commit: function () {
        return api.Commit('') === 'true';
      },
      setProgress: function (ratio) {
        var percent = Math.round(ratio * 100);
        var r1 = api.SetValue('cmi.score.raw', String(percent));
        var r2 = api.SetValue('cmi.score.max', '100');
        var r3 = api.SetValue('cmi.score.min', '0');
        var r4 = api.SetValue('cmi.score.scaled', String(ratio));
        var r5 = api.SetValue('cmi.completion_status', 'incomplete');
        var r6 = api.SetValue('cmi.progress_measure', String(ratio));
        return [r1, r2, r3, r4, r5, r6].every(function (r) { return r === 'true'; });
      },
      setCompleted: function () {
        var r1 = api.SetValue('cmi.score.raw', '100');
        var r2 = api.SetValue('cmi.score.scaled', '1');
        var r3 = api.SetValue('cmi.completion_status', 'completed');
        var r4 = api.SetValue('cmi.progress_measure', '1');
        return [r1, r2, r3, r4].every(function (r) { return r === 'true'; });
      },
      // cmi.suspend_data : champ texte libre (64000 car. max en SCORM 2004)
      // prévu pour reprendre une session interrompue.
      setSuspendData: function (str) {
        return api.SetValue('cmi.suspend_data', str) === 'true';
      },
      getSuspendData: function () {
        return api.GetValue('cmi.suspend_data') || '';
      },
    };
  }

  function createNoopDriver() {
    return {
      type: null,
      initialize: function () { return false; },
      terminate: function () { return false; },
      commit: function () { return false; },
      setProgress: function () { return false; },
      setCompleted: function () { return false; },
      setSuspendData: function () { return false; },
      getSuspendData: function () { return ''; },
    };
  }

  /* ===========================
     DÉTECTION + BRIDGE
     =========================== */

  function detectDriver() {
    var tom = findToM();
    if (tom) return createToMDriver(tom);

    var api2004 = findScormAPI('API_1484_11');
    if (api2004) return createScorm2004Driver(api2004);

    var api12 = findScormAPI('API');
    if (api12) return createScorm12Driver(api12);

    return createNoopDriver();
  }

  var driver = null;
  var initialized = false;

  var ScormBridge = {
    /** À appeler une fois, au chargement de l'app. */
    initialize: function () {
      driver = detectDriver();
      initialized = driver.initialize();
      if (initialized) {
        console.info('[SCORM] LMS détecté :', driver.type);
      } else {
        console.info('[SCORM] Aucun LMS détecté — mode autonome (aucune donnée envoyée)');
      }
      return initialized;
    },

    /**
     * Reporte la progression (0 à 1) au LMS. Appelé à chaque modale visitée
     * afin que la progression soit connue même si l'utilisateur quitte
     * avant d'avoir tout visité.
     */
    reportProgress: function (ratio) {
      if (!initialized || !driver) return;
      driver.setProgress(Math.max(0, Math.min(1, ratio)));
      driver.commit();
    },

    /** À appeler quand toutes les modales ont été visitées. */
    reportCompleted: function () {
      if (!initialized || !driver) return;
      driver.setCompleted(true);
      driver.commit();
    },

    /** À appeler à la fermeture de l'app (bouton QUITTER, unload). */
    terminate: function () {
      if (!initialized || !driver) return;
      driver.commit();
      driver.terminate();
    },

    /**
     * Sauvegarde l'état du jeu (ingrédients trouvés + cible en cours) dans
     * cmi.suspend_data, pour reprendre une session interrompue au lieu de
     * tout recommencer au prochain lancement. `data` est sérialisé en JSON.
     */
    saveState: function (data) {
      if (!initialized || !driver) return;
      try {
        driver.setSuspendData(JSON.stringify(data));
        driver.commit();
      } catch (e) {}
    },

    /**
     * Relit l'état sauvegardé au lancement précédent. Retourne null si
     * aucune donnée valide n'est trouvée (première visite, hors LMS, JSON
     * corrompu...).
     */
    loadState: function () {
      if (!initialized || !driver) return null;
      try {
        var raw = driver.getSuspendData();
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (e) { return null; }
    },

    /**
     * Langue du cours dans Teach on Mars (différente de la langue de
     * l'appli). Lit ToM.env.get('CONTENT_LANGUAGE') — indépendant du
     * driver de reporting choisi ci-dessus (ToM.env vs ToM.data sont deux
     * namespaces distincts). Retourne null si aucun environnement ToM
     * n'est détecté (test local/Vercel, SCORM Cloud) : le contenu doit
     * alors retomber sur une langue par défaut.
     */
    getContentLanguage: function () {
      var tom = findToM();
      if (tom && tom.env) {
        try {
          var lang = tom.env.get('CONTENT_LANGUAGE');
          if (lang) return String(lang).toLowerCase();
        } catch (e) {}
      }
      return null;
    },
  };

  window.ScormBridge = ScormBridge;
})();
