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
      terminate: function () {
        try { api.utils.close(); return true; } catch (e) { return false; }
      },
      commit: function () {
        try { api.data.send(); return true; } catch (e) { return false; }
      },
      setProgress: function (ratio) {
        try {
          var current = api.data.get('progress') || 0;
          if (current < ratio) api.data.set('progress', ratio);
          return true;
        } catch (e) { return false; }
      },
      setCompleted: function (success) {
        try {
          api.data.set('success', !!success);
          api.data.set('progress', 1);
          return true;
        } catch (e) { return false; }
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
  };

  window.ScormBridge = ScormBridge;
})();
