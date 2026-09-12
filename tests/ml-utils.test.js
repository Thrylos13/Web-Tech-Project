const {
  linearRegression,
  kMeans,
  zScoreAnomaly,
  celsiusToFahrenheit,
  msToKmh,
  msToMph,
} = require('../ml-utils.js');

describe('linearRegression', () => {
  it('fits a perfect increasing line with slope 2', () => {
    const points = [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 6 }];
    const { slope, intercept } = linearRegression(points);
    expect(slope).toBeCloseTo(2, 5);
    expect(intercept).toBeCloseTo(0, 5);
  });

  it('fits a perfect decreasing line with negative slope', () => {
    const points = [{ x: 0, y: 10 }, { x: 1, y: 8 }, { x: 2, y: 6 }, { x: 3, y: 4 }];
    const { slope } = linearRegression(points);
    expect(slope).toBeCloseTo(-2, 5);
  });

  it('returns slope 0 for a single point (insufficient data)', () => {
    const { slope } = linearRegression([{ x: 0, y: 5 }]);
    expect(slope).toBe(0);
  });

  it('returns slope 0 for a flat line', () => {
    const points = [{ x: 0, y: 20 }, { x: 1, y: 20 }, { x: 2, y: 20 }];
    const { slope } = linearRegression(points);
    expect(slope).toBeCloseTo(0, 5);
  });
});

describe('kMeans', () => {
  it('separates two obviously distinct weather profiles', () => {
    const points = [
      { temp: 5,  humidity: 80, wind: 10 },
      { temp: 6,  humidity: 82, wind: 12 },
      { temp: 35, humidity: 20, wind: 5  },
      { temp: 36, humidity: 18, wind: 6  },
    ];
    const assignments = kMeans(points, 2);
    expect(assignments[0]).toBe(assignments[1]);
    expect(assignments[2]).toBe(assignments[3]);
    expect(assignments[0]).not.toBe(assignments[2]);
  });

  it('assigns every point its own cluster when points <= k', () => {
    const points = [{ temp: 10, humidity: 50, wind: 5 }, { temp: 20, humidity: 60, wind: 8 }];
    const assignments = kMeans(points, 3);
    expect(assignments).toEqual([0, 1]);
  });
});

describe('zScoreAnomaly', () => {
  const population = [20, 21, 19, 20, 22, 21, 20, 19, 21, 20];

  it('flags a clear outlier with |z| >= 2', () => {
    const { zScore } = zScoreAnomaly(35, population);
    expect(Math.abs(zScore)).toBeGreaterThanOrEqual(2);
  });

  it('does not flag a value close to the mean', () => {
    const { zScore } = zScoreAnomaly(20.5, population);
    expect(Math.abs(zScore)).toBeLessThan(1);
  });

  it('returns zScore 0 for an empty population', () => {
    const { zScore } = zScoreAnomaly(20, []);
    expect(zScore).toBe(0);
  });
});

describe('unit conversions', () => {
  it('converts 0°C to 32°F', () => {
    expect(celsiusToFahrenheit(0)).toBeCloseTo(32, 5);
  });

  it('converts 100°C to 212°F', () => {
    expect(celsiusToFahrenheit(100)).toBeCloseTo(212, 5);
  });

  it('converts 10 m/s to 36 km/h', () => {
    expect(msToKmh(10)).toBeCloseTo(36, 5);
  });

  it('converts 10 m/s to approximately 22.4 mph', () => {
    expect(msToMph(10)).toBeCloseTo(22.4, 1);
  });
});
