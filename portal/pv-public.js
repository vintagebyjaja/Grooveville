/* Shared public landing pages for Rentals and Events. */
(function () {
  const E = PV.e;

  PV.publicLanding = ({ kind, section, title, intro, actions, browse, content, showcase }) => {
    const background = showcase ? '' : '<img class="pv-public-image" src="/media/rentals-architecture.webp" alt="" fetchpriority="high">';
    return '<div class="pv pv-public pv-public-' + kind + '"><section class="pv-public-hero">' +
      background + '<div class="pv-public-copy"><header><div class="pvkick">' + E(section) + '</div><h1>' + E(title) + '</h1></header>' +
      '<div class="pv-public-intro"><p>' + E(intro) + '</p><div class="pvrow">' + PV.publicJump(browse) + actions + (PV.me?.founder ? '<a class="pvbtn lg" href="#team-portals/' + (kind === "rentals" ? "rentals" : "locations") + '">Founder tools</a>' : '') + '</div></div></div>' +
      (showcase || '') + '</section><div class="pv-public-content">' + content + '</div></div>';
  };

  PV.publicJump = label => '<button class="pvbtn pk lg" data-act="pv-public-browse">' + E(label) + '</button>';
  PV.acts["pv-public-browse"] = () => {
    const target = document.getElementById("pv-public-browse");
    target.focus({ preventScroll: true });
    target.scrollIntoView();
  };
  PV.publicSection = (title, body, browse = false) =>
    '<section class="pv-public-section"' + (browse ? ' id="pv-public-browse" tabindex="-1"' : '') +
    '><h2>' + E(title) + '</h2>' + body + '</section>';
  PV.publicInfo = items => '<div class="pvgrid pvg2">' + items.map(([icon, title, copy]) =>
    '<div class="pvpanel"><div class="pv-public-icon">' + PV.ic(icon) + '</div><h3>' + E(title) + '</h3><p>' + E(copy) + '</p></div>'
  ).join("") + '</div>';
})();
