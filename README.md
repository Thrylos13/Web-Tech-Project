# Weather Forecast

A weather dashboard built with vanilla JavaScript, HTML, and CSS. It started out as a simple weather lookup tool and grew into something a bit more ambitious along the way: it pulls from four separate APIs, runs a few machine learning techniques right in the browser, trains a small neural network on the fly, and works offline as an installable app.

**Live demo:** https://thrylos13.github.io/Web-Tech-Project/

<!-- add a screenshot or short gif of the app here -->

## What it does

Search any city (or use geolocation, or just say the name out loud) and you get current conditions, a 5 day forecast, an hourly temperature and rain chart, air quality and UV index, sunrise and sunset times, and a wind direction compass. There's also a historical pattern view that compares today's temperature to the last 10 years for that exact calendar date, flags anything statistically unusual, and shows a neural network's prediction for what next year might look like.

A few things worth pointing out:

- Three traditional ML techniques are implemented from scratch, not pulled in from a library: linear regression for short term trend detection, k-means clustering to find pinned cities with similar weather right now, and z-score based anomaly detection on the historical data. The regression and clustering both run inside a Web Worker so they never block the UI while calculating.
- A small neural network is trained directly in the browser with TensorFlow.js, on the same 10 years of historical data, to predict next year's temperature for that date.
- The app is a full PWA. It has a service worker for offline caching and can be installed like a native app straight from the browser.
- Pinned cities and recent searches live in IndexedDB instead of localStorage, with an automatic one time migration for anyone who used an earlier version of the app.
- There's a light and dark theme, both built with CSS custom properties, and the charts switch their color palette depending on which one is active.
- Every external API call goes through a small retry wrapper with exponential backoff, so a flaky connection doesn't just fail outright.
- Basic accessibility is built in too: keyboard navigation through search suggestions, focus trapping inside the modal panes, and a live region that announces weather updates to screen readers.

## APIs and data sources

- OpenWeatherMap for current conditions, the 5 day forecast, geocoding, air pollution data, and the weather map tile layers
- Open-Meteo for the UV index and the 10 year historical archive (no API key needed for this one)
- Unsplash for the background photo of whatever city you search
- OpenStreetMap for the base map tiles, rendered through Leaflet

## Built with

JavaScript, HTML5, CSS3, Chart.js for the charts, Leaflet for the map, TensorFlow.js for the neural network, and the Web Speech API for voice search. Testing runs on Vitest, and GitHub Actions handles both running the test suite on every push and deploying the site to GitHub Pages.

## Running it locally

There's no build step since it's plain HTML, CSS, and JavaScript. Clone the repo and serve the folder with any static server, for example:

```bash
git clone https://github.com/Thrylos13/Web-Tech-Project.git
cd Web-Tech-Project
npx serve .
```

Opening index.html straight from your filesystem mostly works, but a few things like geolocation, the service worker, and IndexedDB need a real http or https origin to function, so it's worth serving it locally instead.

You'll need your own free API keys for OpenWeatherMap and Unsplash. Drop them into the constants near the top of Project.js once you have them.

## Running the tests

The ML functions (regression, k-means, anomaly detection) are pure functions with no DOM dependency, which is what makes them easy to test on their own:

```bash
npm install
npm test
```

## Project structure

```
index.html            the app shell
Project.css           all styling, including the theme variables
Project.js            most of the app logic
ml-utils.js           the ML functions, shared between the main thread, the worker, and the tests
ml-worker.js          runs k-means and regression off the main thread
idb.js                small IndexedDB wrapper
manifest.json         PWA manifest
sw.js                 service worker
tests/                Vitest unit tests
.github/workflows/    CI for tests, and deployment to GitHub Pages
```

## Known limitations

The neural network is trained on roughly 10 data points per city, since that's all 10 years of daily history gives you for a single date. It's there to show a real client side training loop with TensorFlow.js, not to compete with an actual forecasting model, so its prediction is more illustrative than something to plan around. The k-means clustering has the same kind of limit: it only has as much data as however many cities you've pinned, so it works best once you've pinned three or four.
