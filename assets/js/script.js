document.addEventListener('DOMContentLoaded', () =>{
  // const unitsToggleBtn = document.getElementById('units-toggle-btn');
  const unitsMenu = document.getElementById('units-menu');
  // const daysMenu = document.getElementById('day-select-list')
  const ToggleBtn = document.querySelectorAll('.togglebtn')
  const dayMenu = document.querySelector('#day-select-list');
  const inputBox = document.querySelector('input')
  const inputCard = document.querySelector('.input-card')
  const shearchCityList = document.querySelector('.city-list')
  const submitForm = document.querySelector('form')
  const submitBtn = document.querySelector('.search-btn')



  // 1. Toggle state
  ToggleBtn.forEach(button =>{

    button.addEventListener('click', (e) => {
      e.stopPropagation();
      if(button===ToggleBtn[0])
      {
        unitsMenu.classList.toggle('hidden');      
        const isExpanded = !unitsMenu.classList.contains('hidden');
        button.setAttribute('aria-expanded', isExpanded);
        return;
      }
      else{
        dayMenu.classList.toggle('hidden');
        const isExpanded = !dayMenu.classList.contains('hidden');
        button.setAttribute('aria-expanded', isExpanded);
        return;
      }
    });

  });

  // 2. Gestion de la sélection d'une option (déplacement de la coche)
  const optionButtons = document.querySelectorAll('.unit-option');

  optionButtons.forEach(button => {
    button.addEventListener('click', () => {
      const groupType = button.getAttribute('data-unit');
      
      // Désélectionner toutes les options du même groupe (ex: température)
      document.querySelectorAll(`.unit-option[data-unit="${groupType}"]`).forEach(btn => {
        btn.classList.remove('selected');
      });
      // console.log(groupType)

      // Sélectionner l'option cliquée
      button.classList.add('selected');
    });
  });

  const dayOptions = document.querySelectorAll('.day-option');

  dayOptions.forEach(day =>{
    day.addEventListener('click', () =>{

      const groupType = day.getAttribute('data-clas');
      const daySelected = document.querySelector('#daily-overview')
      daySelected.textContent = day.textContent
      // Désélectionner toutes les options du même groupe (ex: température)
      document.querySelectorAll(`.day-option[data-clas="${groupType}"]`).forEach(btn => {
        btn.classList.remove('selected');
      });

      // console.log(groupType)

      // dayOptions[0].classList.remove('selected');
      day.classList.add('selected');
      
    });
  });


  // 3. Fermer le menu si on clique n'importe où ailleurs sur la page
  document.addEventListener('click', (e) => {

    if (!unitsMenu.contains(e.target) && !ToggleBtn[0].contains(e.target)) {
      unitsMenu.classList.add('hidden');
      ToggleBtn[0].setAttribute('aria-expanded', 'false');
    }

    if (!dayMenu.contains(e.target) && !ToggleBtn[1].contains(e.target)) {
      dayMenu.classList.add('hidden');
      ToggleBtn[1].setAttribute('aria-expanded', 'false');
    }

    // if (!shearchCityList.contains(e.target)&& !inputBox.contains(e.target)) {
    //   shearchCityList.classList.toggle('display');
    // }

  });

  const getCity = () =>{
    if(inputBox.value !== ''){
      shearchCityList.style.display = 'block'
      return
    }

    if (inputBox.value === '') {
      shearchCityList.style.display = 'none'
      return 
    }
    
  }



  //Input state
  inputBox.addEventListener('input', ()=>{
    getCity()
  });

  submitBtn.addEventListener('click', () =>{
    
    if (inputBox.value.trim() === ''){
      inputBox.setCustomValidity('Enter a place please!')
      inputBox.reportValidity()
      inputCard.style.border = '.3rem solid rgb(186, 115, 8)'

      return
    }
  })

  submitForm.addEventListener('submit', async (e) =>{

    e.preventDefault();

    const placeInputed = inputBox.value.trim();
    if (!placeInputed) return;

    try{
      const coords = await ShearchCoordonate(placeInputed);

      if(!coords){
        console.log("Ici on a partir du weather preview doit etre remplacer par le message d'erreur");
        return;
      }

      const emplacement = await getUsuerEmplacement(coords.longitude, coords.latitude);
      const weatherInfoFromInput = await APIcontrol(coords.longitude, coords.latitude);


    }
    catch (error){

    }

  })

  


  async function APIcontrol (longitude, latitude)  {

    try{
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max&timezone=auto&forecast_days=7`;

    const response = await fetch(url);
    const data = await response.json();
    console.log(`Voici les coordonnes de la meteo`)

    console.log(data);
    console.log(data.current.temperature_2m)
    console.log(data.current)

    setCurrentInfo(data)

    } catch (e) {
      console.log(`Voici l'erreur obtenu: ${e}`)
    }
  }



  function getLocation(){
    const options ={
    enableHighAccuracy: true,
    timeout:5000,
    maximumAge:0
    };
    return new 
    Promise((resolve, reject) =>{
      navigator.geolocation.getCurrentPosition(
        (position) =>{
          resolve({
            longitude: position.coords.longitude,
            latitude: position.coords.latitude
          })
        },
        (error) =>{
          reject(error);
        },
        options
      )
    })
  }

  async function getUsuerEmplacement(longitude, latitude){

    try{     
      const location = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`
        );
        const data = await location.json()
        console.log(`Voici les coordonnees de la position actuel:`)
        console.log(data)


    }
    catch (e){
      console.log(e)
    }
  }

  async function ShearchCoordonate(place) {

    try{
      const coordonate = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(place)}`
        );
      const data = await coordonate.json();
      if(data.lenght===0){
        throw 'Lieu introuvable'
      }

      console.log(`Voici les coordonnees de l'emplacement fournit:`)
      console.log(data)
      console.log(data[0].lat)
      console.log(data[0].lon)


      return {
        longitude: Number(data[0].lon),
        latitude: Number(data[0].lat)
      }
    }
    catch (e){
      console.log(e)
    }
  }

  async function main(){
    const location = await getLocation()

    getUsuerEmplacement(location.longitude, location.latitude);
    APIcontrol(location.longitude, location.latitude);

  }

  function setCurrentInfo(data /*placeData*/){
    const currentTemp = document.querySelector('#preview-temperature')
    currentTemp.textContent = data.current.temperature_2m;

    const currentCity = document.getElementById('current-city');
    const currentCountry = document.getElementById('current-country');

    // currentCity.textContent = placeData.address.city
    // currentCountry.textContent = placeData.address.

    

  }

  

  // main()
  
});