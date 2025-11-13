// MSFS Flight Assistant - Main Application
class FlightAssistant {
    constructor() {
        this.currentFlightPlan = null;
        this.speechSynthesis = window.speechSynthesis;
        this.selectedVoice = null;
        this.isATCRunning = false;
        this.atcSequence = 0;
        
        this.init();
    }

    async init() {
        this.registerServiceWorker();
        this.setupEventListeners();
        this.loadVoices();
        this.checkInstallPrompt();
        this.loadFlightPlan();
    }

    // Service Worker Registration
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered successfully');
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }

    // Setup Event Listeners
    setupEventListeners() {
        // Welcome Screen
        document.getElementById('get-started-btn').addEventListener('click', () => this.goToLogin());
        
        // Login Form
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        
        // Flight Screen
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());
        document.getElementById('speak-all-btn').addEventListener('click', () => this.speakAll());
        document.getElementById('speak-route-btn').addEventListener('click', () => this.speakRoute());
        document.getElementById('speak-weather-btn').addEventListener('click', () => this.speakWeather());
        document.getElementById('speak-atc-btn').addEventListener('click', () => this.speakATC());
        document.getElementById('atc-simulation-btn').addEventListener('click', () => this.openATCSimulation());
        document.getElementById('voice-select').addEventListener('change', (e) => {
            const voiceIndex = e.target.value;
            if (voiceIndex !== '') {
                this.selectedVoice = this.speechSynthesis.getVoices()[voiceIndex];
            }
        });

        // Individual Speak Buttons
        document.querySelectorAll('.speak-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const dataType = btn.dataset.text;
                this.speakData(dataType);
            });
        });

        // ATC Screen
        document.getElementById('atc-simulation-btn').addEventListener('click', () => this.openATCSimulation());
        document.getElementById('close-atc-btn').addEventListener('click', () => this.closeATCSimulation());
        document.getElementById('start-atc-btn').addEventListener('click', () => this.startATCSimulation());
        document.getElementById('stop-atc-btn').addEventListener('click', () => this.stopATCSimulation());
    }

    // Screen Navigation
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => screen.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
    }

    goToLogin() {
        this.showScreen('login-screen');
    }

    goToFlight() {
        this.showScreen('flight-screen');
    }

    openATCSimulation() {
        this.showScreen('atc-screen');
        document.getElementById('atc-transcript').innerHTML = '<div class="atc-message system">Ready for ATC simulation. Click start to begin.</div>';
    }

    closeATCSimulation() {
        this.showScreen('flight-screen');
        this.stopATCSimulation();
    }

    // Voice Setup
    loadVoices() {
        const voiceSelect = document.getElementById('voice-select');
        const voices = this.speechSynthesis.getVoices();

        if (voices.length === 0) {
            this.speechSynthesis.onvoiceschanged = () => this.loadVoices();
            return;
        }

        voiceSelect.innerHTML = '<option value="">Select Voice</option>';
        voices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });

        // Auto-select first voice
        if (voices.length > 0) {
            this.selectedVoice = voices[0];
        }
    }

    // SimBrief API Integration
    async handleLogin(e) {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const errorDiv = document.getElementById('login-error');

        if (!username.trim()) {
            this.showError('Please enter a username or email', errorDiv);
            return;
        }

        this.showLoading(true);
        errorDiv.classList.remove('show');

        try {
            const response = await fetch(`https://www.simbrief.com/api/xml.fetcher.php?username=${encodeURIComponent(username)}&json=1`);
            
            if (!response.ok) {
                throw new Error('Failed to fetch flight plan');
            }

            const data = await response.json();

            if (data.error) {
                this.showError(`Error: ${data.error}`, errorDiv);
                this.showLoading(false);
                return;
            }

            this.currentFlightPlan = data;
            localStorage.setItem('lastFlightPlan', JSON.stringify(data));
            localStorage.setItem('lastUsername', username);

            this.displayFlightPlan(data);
            this.goToFlight();
            this.showLoading(false);

        } catch (error) {
            console.error('Login error:', error);
            this.showError('Failed to fetch flight plan. Check your internet connection.', errorDiv);
            this.showLoading(false);
        }
    }

    // Display Flight Plan Data
    displayFlightPlan(data) {
        const fp = data.aircraft || {};
        const origin = data.origin || {};
        const destination = data.destination || {};
        const alternate = data.alternate || {};
        const cruise = data.cruise || {};

        // Flight Title
        const flightTitle = `${data.callsign || 'N/A'} - ${origin.icao || 'N/A'} to ${destination.icao || 'N/A'}`;
        document.getElementById('flight-title').textContent = flightTitle;

        // Flight Information
        document.getElementById('callsign').textContent = data.callsign || 'N/A';
        document.getElementById('departure').textContent = `${origin.icao || 'N/A'} - ${origin.name || 'N/A'}`;
        document.getElementById('destination').textContent = `${destination.icao || 'N/A'} - ${destination.name || 'N/A'}`;
        document.getElementById('alternate').textContent = `${alternate.icao || 'N/A'} - ${alternate.name || 'N/A'}`;

        // Cruise Details
        document.getElementById('cruise-alt').textContent = `FL${cruise.altitude || 'N/A'}`;
        document.getElementById('distance').textContent = `${data.distance || 'N/A'} NM`;
        
        const flightTime = data.flight_time ? `${Math.floor(data.flight_time / 60)}h ${data.flight_time % 60}m` : 'N/A';
        document.getElementById('flight-time').textContent = flightTime;

        // Fuel
        document.getElementById('trip-fuel').textContent = `${Math.round(data.fuel.contingency_fuel || 0)} LBS`;
        document.getElementById('reserve-fuel').textContent = `${Math.round(data.fuel.reserve_fuel || 0)} LBS`;
        document.getElementById('total-fuel').textContent = `${Math.round((data.fuel.contingency_fuel || 0) + (data.fuel.reserve_fuel || 0))} LBS`;

        // Route
        this.displayRoute(data);

        // Weather
        this.displayWeather(data);

        // ATC Callsigns
        this.displayATCCallsigns(data);
    }

    displayRoute(data) {
        const navlog = data.navlog || [];
        const routeDiv = document.getElementById('route');

        if (navlog.length === 0) {
            routeDiv.textContent = 'No route data available';
            return;
        }

        let routeText = navlog.map((fix, index) => {
            return `${index + 1}. ${fix.ident || 'FIX'} - Alt: ${fix.altitude || 'N/A'} ft`;
        }).join('\n');

        routeDiv.textContent = routeText;
    }

    displayWeather(data) {
        const weatherDiv = document.getElementById('weather-info');
        const weather = data.weather || {};

        if (!weather.departure && !weather.destination) {
            weatherDiv.textContent = 'No weather data available';
            return;
        }

        let weatherText = '';
        if (weather.departure) {
            weatherText += `DEPARTURE (${data.origin?.icao || 'N/A'}):\n`;
            weatherText += `METAR: ${weather.departure?.metar || 'N/A'}\n\n`;
        }
        if (weather.destination) {
            weatherText += `DESTINATION (${data.destination?.icao || 'N/A'}):\n`;
            weatherText += `METAR: ${weather.destination?.metar || 'N/A'}\n`;
        }

        weatherDiv.textContent = weatherText;
    }

    displayATCCallsigns(data) {
        const atcDiv = document.getElementById('atc-callsigns');
        const origin = data.origin || {};
        const destination = data.destination || {};

        let atcText = `
DEPARTURE ATC:
ICAO: ${origin.icao || 'N/A'}
Name: ${origin.name || 'N/A'}
Runway: ${origin.runway || 'N/A'}

DESTINATION ATC:
ICAO: ${destination.icao || 'N/A'}
Name: ${destination.name || 'N/A'}
Runway: ${destination.runway || 'N/A'}

ALTERNATE:
ICAO: ${data.alternate?.icao || 'N/A'}
Name: ${data.alternate?.name || 'N/A'}
        `;

        atcDiv.textContent = atcText.trim();
    }

    // Speech Synthesis
    speak(text) {
        if (!text || text === 'N/A' || text === '-') return;

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.selectedVoice;
        utterance.rate = 0.9;
        utterance.pitch = 1;

        this.speechSynthesis.cancel();
        this.speechSynthesis.speak(utterance);
    }

    speakData(dataType) {
        const textMap = {
            'callsign': `Callsign is ${document.getElementById('callsign').textContent}`,
            'departure': `Departing from ${document.getElementById('departure').textContent}`,
            'destination': `Destination is ${document.getElementById('destination').textContent}`,
            'alternate': `Alternate airport ${document.getElementById('alternate').textContent}`,
            'cruise-alt': `Cruise altitude ${document.getElementById('cruise-alt').textContent}`,
            'distance': `Distance ${document.getElementById('distance').textContent}`,
            'flight-time': `Flight time ${document.getElementById('flight-time').textContent}`,
            'trip-fuel': `Trip fuel ${document.getElementById('trip-fuel').textContent}`,
            'reserve-fuel': `Reserve fuel ${document.getElementById('reserve-fuel').textContent}`,
            'total-fuel': `Total fuel ${document.getElementById('total-fuel').textContent}`
        };

        this.speak(textMap[dataType] || 'No information');
    }

    speakAll() {
        const flightInfo = `
            Callsign ${document.getElementById('callsign').textContent}.
            Departing ${document.getElementById('departure').textContent}.
            Destination ${document.getElementById('destination').textContent}.
            Alternate ${document.getElementById('alternate').textContent}.
            Cruise altitude ${document.getElementById('cruise-alt').textContent}.
            Distance ${document.getElementById('distance').textContent}.
            Flight time ${document.getElementById('flight-time').textContent}.
            Trip fuel ${document.getElementById('trip-fuel').textContent}.
            Reserve fuel ${document.getElementById('reserve-fuel').textContent}.
        `;

        this.speak(flightInfo);
    }

    speakRoute() {
        const routeText = document.getElementById('route').textContent;
        this.speak(routeText);
    }

    speakWeather() {
        const weatherText = document.getElementById('weather-info').textContent;
        this.speak(weatherText);
    }

    speakATC() {
        const atcText = document.getElementById('atc-callsigns').textContent;
        this.speak(atcText);
    }

    // ATC Simulation
    startATCSimulation() {
        this.isATCRunning = true;
        this.atcSequence = 0;
        document.getElementById('start-atc-btn').disabled = true;
        document.getElementById('stop-atc-btn').disabled = false;

        this.runATCSequence();
    }

    stopATCSimulation() {
        this.isATCRunning = false;
        this.speechSynthesis.cancel();
        document.getElementById('start-atc-btn').disabled = false;
        document.getElementById('stop-atc-btn').disabled = true;
    }

    runATCSequence() {
        if (!this.isATCRunning) return;

        const callsign = this.currentFlightPlan?.callsign || 'CALLSIGN';
        const origin = this.currentFlightPlan?.origin?.icao || 'ORIGIN';
        const destination = this.currentFlightPlan?.destination?.icao || 'DESTINATION';
        const cruise = this.currentFlightPlan?.cruise?.altitude || '10000';

        const sequences = [
            { role: 'atc', text: `${origin} Clearance, ${callsign}` },
            { role: 'pilot', text: `${callsign}, requesting IFR clearance to ${destination}` },
            { role: 'atc', text: `${callsign}, cleared to ${destination} as filed, climb and maintain ${cruise} feet, squawk 1234` },
            { role: 'pilot', text: `Cleared to ${destination} as filed, climbing to ${cruise}, squawk 1234, ${callsign}` },
            { role: 'atc', text: `${callsign}, taxi runway one-seven left, wind zero-two-zero at 8 knots` },
            { role: 'pilot', text: `Taxi runway one-seven left, ${callsign}` },
            { role: 'atc', text: `${callsign}, line up and wait runway one-seven left` },
            { role: 'pilot', text: `Lining up runway one-seven left, ${callsign}` },
            { role: 'atc', text: `${callsign}, cleared for takeoff runway one-seven left` },
            { role: 'pilot', text: `Cleared for takeoff, ${callsign}` },
        ];

        if (this.atcSequence < sequences.length) {
            const seq = sequences[this.atcSequence];
            this.addATCMessage(seq.role, seq.text);
            this.speak(seq.text);

            this.atcSequence++;
            setTimeout(() => this.runATCSequence(), 3000);
        } else {
            this.stopATCSimulation();
        }
    }

    addATCMessage(role, text) {
        const transcript = document.getElementById('atc-transcript');
        const messageDiv = document.createElement('div');
        messageDiv.className = `atc-message ${role}`;
        messageDiv.textContent = `${role.toUpperCase()}: ${text}`;
        transcript.appendChild(messageDiv);
        transcript.scrollTop = transcript.scrollHeight;
    }

    // Utility Functions
    logout() {
        this.currentFlightPlan = null;
        localStorage.removeItem('lastFlightPlan');
        this.showScreen('login-screen');
        document.getElementById('login-form').reset();
    }

    loadFlightPlan() {
        const saved = localStorage.getItem('lastFlightPlan');
        if (saved) {
            try {
                this.currentFlightPlan = JSON.parse(saved);
                this.displayFlightPlan(this.currentFlightPlan);
                this.goToFlight();
            } catch (e) {
                console.error('Error loading saved flight plan:', e);
            }
        }
    }

    showError(message, element) {
        element.textContent = message;
        element.classList.add('show');
    }

    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'flex' : 'none';
    }

    checkInstallPrompt() {
        let deferredPrompt;
        const installBtn = document.getElementById('install-btn');

        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.style.display = 'block';
        });

        installBtn.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                deferredPrompt = null;
                installBtn.style.display = 'none';
            }
        });

        window.addEventListener('appinstalled', () => {
            console.log('PWA was installed');
        });
    }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FlightAssistant();
});
