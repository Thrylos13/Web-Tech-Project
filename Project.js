const geoButton = document.getElementById('geolocation-button');
geoButton.addEventListener('click', function() {
  navigator.geolocation.getCurrentPosition(function(position) {
    const lat = position.coords.latitude;
    const lon = position.coords.longitude;
    fetch("https://api.openweathermap.org/data/2.5/weather?lat=" + lat + "&lon=" + lon + "&units=metric&appid=" + weather.apiKey, { mode:'cors' })
      .then((response) => {
        if (!response.ok) {
          throw new Error("City not found");
        }
        return response.json();
      })
      .then((data) => {
        hideError();
        weather.displayWeather(data);
      })
      .catch((error) => {
        console.error(error);
        showError("Error: " + error.message);
        clearInterval(intervalId);
      });
  });
});

const errorBox = document.getElementById('error-box');
const errorMessage = document.getElementById('error-message');
const closeError = document.getElementById('close-error');

function showError(message) {
  errorMessage.innerText = message;
  errorBox.classList.add('show');
}
function hideError() {
  errorBox.classList.remove('show');
}
let intervalId;
function displayTime(timezone) {
  clearInterval(intervalId);
  let utcHours = timezone / 3600;
  const d = new Date();
  const localTime = d.getTime();
  const localOffset = d.getTimezoneOffset() * 60000;

  const utc = localTime + localOffset;
  const getTime = utc + 3600000 * utcHours;

  const getTimeNow = new Date(getTime);
  const hrs = getTimeNow.getHours();
  const min = getTimeNow.getMinutes();

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const month = monthNames[getTimeNow.getMonth()];
  const date = getTimeNow.getDate();
  const day = dayNames[getTimeNow.getDay()];

  document.getElementById("day").innerHTML = day;
  document.getElementById("month").innerHTML = " " + month;
  document.getElementById("date-today").innerHTML = date;

  if (min < 10) {
    document.getElementById("minutes").innerHTML = "0" + min;
  } else {
    document.getElementById("minutes").innerHTML = min;
  }

  if (hrs < 10) {
    document.getElementById("hours").innerHTML = "0" + hrs;
  } else {
    document.getElementById("hours").innerHTML = hrs;
  }
  intervalId = setInterval(() => {
    displayTime(timezone);
  }, 60000);
}
let weather = {
  apiKey: "939b484a6cf581bc03c41806fb3b486a",
  fetchWeather: function (city) {
    fetch("https://api.openweathermap.org/data/2.5/weather?q=" + city + "&units=metric&appid=" + this.apiKey, { mode:'cors' })

    .then((response) => {
      if (!response.ok) {
        throw new Error("City not found");
      }
      return response.json();
    })
    .then((data) => {
      hideError();
      this.displayWeather(data);

    })
    .catch((error) => {
      console.error(error);
      showError("Error: " + error.message);
      clearInterval(intervalId);
    });
  },
  displayWeather: function(data) {
    const { country } = data.sys;
    const { name, timezone } = data;
    const { icon, description } = data.weather[0];
    const { temp, humidity, feels_like, pressure } = data.main;
    const { speed } = data.wind;
    const { lat, lon } = data.coord;
    console.log(name, icon, description, temp, humidity,pressure, speed, lat, lon, timezone, country)
    document.querySelector(".city").innerText = "Weather in " + name;
    document.querySelector(".country").innerText = country;
    document.querySelector(".icon").src = "https://openweathermap.org/img/wn/" + icon + "@2x.png";
    document.querySelector(".description").innerText = description;
    document.querySelector(".temp").innerText = temp + "°C";
    document.querySelector(".feels_like").innerText = "Feels like: " + feels_like + "°C";
    document.querySelector(".humidity").innerText = "Humidity: " + humidity + "%";
    document.querySelector(".wind").innerText = "Wind Speed: " + speed + " km/hr";
    document.querySelector(".pressure").innerText = "Pressure: " + pressure + " mb";
    document.querySelector(".location").innerText = "Latitude: " + lat + "°N" + ", Longitude: " + lon +"°E";
    document.body.style.backgroundImage = "url('https://source.unsplash.com/1600x900/?" + name +"')";
    displayTime(data.timezone);
},
  search: function () {
    const searchValue = document.querySelector(".search-bar").value;
    if (searchValue) {
      this.fetchWeather(searchValue);
    }
  },
};
document.querySelector(".search button").addEventListener("click", function(){
    weather.search();
});
document.querySelector(".search-bar").addEventListener("keyup",function(event){
    if (event.key =="Enter") {
        weather.search();
    }
});