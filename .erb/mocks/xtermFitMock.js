class FitAddon {
  constructor() {}
  fit() {}
  proposeDimensions() { return { cols: 80, rows: 24 }; }
}

module.exports = { FitAddon };
module.exports.FitAddon = FitAddon;
module.exports.default = { FitAddon };
