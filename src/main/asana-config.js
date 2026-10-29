// GID Asana presi dal Monitor progetti (progetto PRIORITÀ 2026 e campi custom).
'use strict';
module.exports = {
  project: '1213316667564180',      // PRIORITÀ 2026
  prjField: '1213565347235545',     // campo enum PRJ
  weekField: '1213326660948618',    // campo Settimana (es. "W44" o "W44, W45")
  plannedField: '1213642034642228', // campo "pianificato"
  timeField: '1207344268421835',    // campo numerico Tempo (minuti)
  // Elenco di riserva se non si riesce a leggerlo da Asana.
  prjFallback: [
    ['1213565347235546', 'B+B'], ['1213565347235547', 'Piattaforma'], ['1213565347235548', 'Chatwolf'], ['1213565347235549', 'GGDB'],
    ['1213565347235550', 'Roland'], ['1213565347235551', 'Petronas'], ['1213565347235552', 'ISO'], ['1213565347235553', 'BIZDEV'],
    ['1213565347235558', 'Gestione'], ['1213565347235560', 'EPI'], ['1213642094346131', 'Finanziati'], ['1213743379459056', 'irinox'],
    ['1213743379459058', 'FraccaroliBalzan'], ['1213743379459062', 'Swegon'], ['1213872916151083', 'Stadler'], ['1213896228686003', 'ZOPPAS IOT'],
    ['1213896228686081', 'Diasorin PDM'], ['1214040062850665', 'Galdi'], ['1214253804104615', 'ELECTROLUX'], ['1214607495211099', 'Buildtrust'],
    ['1214607495211153', 'ASWATI'], ['1216701185500383', 'Nordica'], ['1216850815940109', 'Abrairide'], ['1217019760286058', 'DOMUS'],
    ['1219417370198996', 'DIASORIN AD'], ['1219710552117074', 'R&D'],
  ].map(([gid, name]) => ({ gid, name })),
};
