const socket = io();

// Ask user for their name
let userName = prompt("Please enter your name:");
if (!userName || userName.trim() === "") {
  userName = "Anonymous";
} else {
  // Trim and limit name length
  userName = userName.trim().substring(0, 20);
}

if (navigator.geolocation) {
  navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      socket.emit("send-location", { latitude, longitude, name: userName });
    },
    (error) => {
      console.error(error);
    },
    {
      enableHighAccuracy: true,
      timeout: 5000,
      maximumAge: 0,
    }
  );
}

const map = L.map("map").setView([0, 0], 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "OpenStreetMap",
}).addTo(map);

const markers = {};
let isMapCentered = false;

socket.on("receive-location", (data) => {
  const { id, latitude, longitude, name } = data;

  // Only center map on current user's first location
  if (id === socket.id && !isMapCentered) {
    map.setView([latitude, longitude], 16);
    isMapCentered = true;
  }

  if (markers[id]) {
    markers[id].setLatLng([latitude, longitude]);
  } else {
    // Check if this is the current user's marker
    const isCurrentUser = id === socket.id;

    // Create marker with different icon for current user
    const markerOptions = isCurrentUser
      ? {
          icon: L.icon({
            iconUrl:
              "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png",
            shadowUrl:
              "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
            iconSize: [25, 41],
            iconAnchor: [12, 41],
            popupAnchor: [1, -34],
            shadowSize: [41, 41],
          }),
        }
      : {};

    markers[id] = L.marker([latitude, longitude], markerOptions).addTo(map);

    // Add tooltip (always visible) and popup with user's name
    if (name) {
      const displayName = isCurrentUser ? `${name} (You)` : name;
      markers[id].bindTooltip(displayName, {
        permanent: true,
        direction: "top",
        className: "user-tooltip",
      });
      markers[id].bindPopup(displayName);
    }
  }
});

socket.on("user-disconnected", (id) => {
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
  }
});
