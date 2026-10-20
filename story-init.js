/* The illustrated story is independent of the paper's measured-result demos. */
(function () {
  'use strict';
  window.FMLMotion.init({
    hero: document.getElementById('memory-scene'),
    story: document.getElementById('story-dialog')
  });
  document.querySelectorAll('[data-play-story]').forEach(function (button) {
    button.addEventListener('click', function () { window.FMLMotion.openStory(); });
  });
})();
