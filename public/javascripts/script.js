const socket = io();

let userName = "";
let locationWatchId = null;
let isTracking = false;
let isLocationVisible = true; // Privacy state
let currentLocation = null; // Store current location for distance calculations
let notificationPermission = null; // Store notification permission status
let notificationsEnabled = true; // User preference for notifications

// DOM elements
const modal = document.getElementById("nameModal");
const nameInput = document.getElementById("nameInput");
const submitBtn = document.getElementById("submitName");
const changeNameBtn = document.getElementById("changeNameBtn");
const togglePrivacyBtn = document.getElementById("togglePrivacyBtn");
const currentUserNameSpan = document.getElementById("currentUserName");
const userCountSpan = document.getElementById("userCount");
const connectionStatus = document.getElementById("connectionStatus");

const STORAGE_KEY = "rtdt_username";
let userCount = 0;

// Initialize - Check localStorage
function init() {
  const savedName = localStorage.getItem(STORAGE_KEY);
  if (savedName && savedName.trim()) {
    userName = savedName.trim().substring(0, 20);
    nameInput.value = userName;
    startTracking();
  } else {
    showModal();
  }
}

// Show modal
function showModal() {
  modal.style.display = "flex";
  nameInput.focus();
}

// Hide modal
function hideModal() {
  modal.style.display = "none";
}

// Update UI with current name
function updateUserNameDisplay() {
  currentUserNameSpan.textContent = userName || "Anonymous";
}

// Handle name submission
function startTracking() {
  userName = nameInput.value.trim();
  if (!userName) {
    userName = "Anonymous";
  }
  userName = userName.substring(0, 20);

  // Save to localStorage
  localStorage.setItem(STORAGE_KEY, userName);

  hideModal();
  updateUserNameDisplay();

  // Start geolocation tracking (only once)
  if (!isTracking) {
    isTracking = true;
    startGeolocation();
  } else {
    // If already tracking, just update the name for next location send
    console.log("Name updated to:", userName);
  }
}

// Start geolocation watching
function startGeolocation() {
  if (!navigator.geolocation) {
    showError("Geolocation is not supported by your browser");
    return;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const { latitude, longitude } = position.coords;
      currentLocation = { latitude, longitude };
      socket.emit("send-location", { latitude, longitude, name: userName });
    },
    (error) => {
      console.error("Geolocation error:", error.message);
      let errorMsg = "Location error: ";
      switch (error.code) {
        case error.PERMISSION_DENIED:
          errorMsg += "Please allow location access";
          break;
        case error.POSITION_UNAVAILABLE:
          errorMsg += "Location unavailable";
          break;
        case error.TIMEOUT:
          errorMsg += "Request timed out";
          break;
        default:
          errorMsg += error.message;
      }
      console.warn(errorMsg);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    }
  );
}

// Show error message
function showError(message) {
  const errorDiv = document.createElement("div");
  errorDiv.className = "error-message";
  errorDiv.textContent = message;
  document.body.appendChild(errorDiv);
  setTimeout(() => errorDiv.remove(), 5000);
}

// Event listeners
submitBtn.addEventListener("click", startTracking);

nameInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    startTracking();
  }
});

changeNameBtn.addEventListener("click", () => {
  showModal();
});

// Socket connection status
socket.on("connect", () => {
  connectionStatus.className = "status-connected";
  connectionStatus.title = "Connected";
  console.log("Connected to server");
});

socket.on("disconnect", () => {
  connectionStatus.className = "status-disconnected";
  connectionStatus.title = "Disconnected";
  console.log("Disconnected from server");
});

socket.on("connect_error", (error) => {
  connectionStatus.className = "status-error";
  connectionStatus.title = "Connection Error";
  console.error("Connection error:", error);
});

// Initialize on page load
window.addEventListener("DOMContentLoaded", () => {
  init();
  requestNotificationPermission();
});

const map = L.map("map").setView([0, 0], 16);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "OpenStreetMap",
}).addTo(map);

const markers = {};
const userData = {}; // Store user data (name, etc.) for each socket id
let isMapCentered = false;

// User list elements
const userListSidebar = document.getElementById("userListSidebar");
const userListContent = document.getElementById("userListContent");
const toggleUserListBtn = document.getElementById("toggleUserList");
const closeUserListBtn = document.getElementById("closeUserList");

// Handle receiving existing users when connecting
socket.on("existing-users", (usersArray) => {
  console.log(`Received ${usersArray.length} existing users`);
  usersArray.forEach((user) => {
    const { id, latitude, longitude, name } = user;
    // Don't create marker for current user here (will be created when location is sent)
    if (id !== socket.id) {
      createOrUpdateMarker(id, latitude, longitude, name, false, false); // false = not current user, false = suppress notification
    }
  });
  updateUserCount();
  // Update user list after loading existing users
  if (currentLocation) {
    updateUserList();
  }
});

socket.on("receive-location", (data) => {
  const { id, latitude, longitude, name } = data;
  const isCurrentUser = id === socket.id;

  // Only center map on current user's first location
  if (isCurrentUser && !isMapCentered) {
    map.setView([latitude, longitude], 16);
    isMapCentered = true;
  }

  createOrUpdateMarker(id, latitude, longitude, name, isCurrentUser);

  // Always update user list to refresh distances
  updateUserList();
});

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in kilometers
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  return distance;
}

// Format distance for display
function formatDistance(distance) {
  if (distance < 1) {
    return `${Math.round(distance * 1000)}m`;
  } else if (distance < 10) {
    return `${distance.toFixed(2)}km`;
  } else {
    return `${distance.toFixed(1)}km`;
  }
}

// Request notification permission
function requestNotificationPermission() {
  if ("Notification" in window) {
    Notification.requestPermission().then((permission) => {
      notificationPermission = permission;
      console.log("Notification permission:", permission);
    });
  }
}

// Show notification when user comes online
function showUserOnlineNotification(userName) {
  if (!notificationsEnabled) return;

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(`${userName} is now online`, {
      body: "A new user has joined the map",
      icon: "https://cdn-icons-png.flaticon.com/512/149/149071.png",
      tag: "user-online",
    });
  }

  // Also show on-screen notification
  showOnScreenNotification(`${userName} is now online`, "success");
}

// Track active notifications for stacking
let notificationCount = 0;

// Show on-screen notification
function showOnScreenNotification(message, type = "info") {
  // Always show on-screen notification regardless of browser notification permission
  const notification = document.createElement("div");
  notification.className = `on-screen-notification notification-${type}`;
  notification.textContent = message;

  // Stack notifications vertically
  notification.style.top = `${70 + notificationCount * 70}px`;
  notificationCount++;

  document.body.appendChild(notification);

  // Force visibility
  notification.style.display = "flex";
  notification.style.visibility = "visible";

  // Animate in
  setTimeout(() => {
    notification.classList.add("show");
  }, 10);

  // Remove after 4 seconds
  setTimeout(() => {
    notification.classList.remove("show");
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
        notificationCount = Math.max(0, notificationCount - 1);
      }
    }, 300);
  }, 4000);
}

// Helper function to create or update markers
function createOrUpdateMarker(
  id,
  latitude,
  longitude,
  name,
  isCurrentUser,
  showNotification = true
) {
  const isNewUser = !markers[id];

  // Store user data
  if (!userData[id]) {
    userData[id] = {};
  }
  userData[id].name = name || "Anonymous";
  userData[id].latitude = latitude;
  userData[id].longitude = longitude;
  userData[id].lastUpdate = Date.now();

  if (markers[id]) {
    // Smoothly animate marker to new position
    markers[id].setLatLng([latitude, longitude], {
      animate: true,
      duration: 1.0,
    });
    // Update tooltip and popup with distance
    if (name && markers[id].getTooltip()) {
      const displayName = isCurrentUser ? `${name} (You)` : name;
      let tooltipText = displayName;
      let popupText = displayName;

      // Add distance if we have current location and it's not the current user
      if (currentLocation && !isCurrentUser) {
        const distance = calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          latitude,
          longitude
        );
        const distanceText = formatDistance(distance);
        tooltipText = `${displayName} (${distanceText})`;
        popupText = `${displayName}<br><small>Distance: ${distanceText}</small>`;
      }

      markers[id].setTooltipContent(tooltipText);
      markers[id].setPopupContent(popupText);
    }
  } else {
    // Create new marker with different colors for different users
    const colors = [
      "blue",
      "red",
      "green",
      "orange",
      "yellow",
      "violet",
      "grey",
      "black",
    ];
    const colorIndex = Object.keys(markers).length % colors.length;
    const markerColor = isCurrentUser ? "blue" : colors[colorIndex];

    const markerOptions = {
      icon: L.icon({
        iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-${markerColor}.png`,
        shadowUrl:
          "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      }),
    };

    markers[id] = L.marker([latitude, longitude], markerOptions).addTo(map);

    // Add tooltip and popup
    if (name) {
      const displayName = isCurrentUser ? `${name} (You)` : name;
      let tooltipText = displayName;
      let popupText = displayName;

      // Add distance if we have current location and it's not the current user
      if (currentLocation && !isCurrentUser) {
        const distance = calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          latitude,
          longitude
        );
        const distanceText = formatDistance(distance);
        tooltipText = `${displayName} (${distanceText})`;
        popupText = `${displayName}<br><small>Distance: ${distanceText}</small>`;
      }

      markers[id].bindTooltip(tooltipText, {
        permanent: true,
        direction: "top",
        className: "user-tooltip",
      });
      markers[id].bindPopup(popupText);
    }

    // Show notification for new user (not current user, and if notifications enabled)
    if (isNewUser && !isCurrentUser && showNotification) {
      showUserOnlineNotification(name || "Anonymous");
    }

    // Update user count
    updateUserCount();
  }

  // Update distance for existing markers when current location changes
  if (!isCurrentUser && currentLocation && markers[id]) {
    const distance = calculateDistance(
      currentLocation.latitude,
      currentLocation.longitude,
      latitude,
      longitude
    );
    const distanceText = formatDistance(distance);
    const displayName = name || "Anonymous";
    markers[id].setTooltipContent(`${displayName} (${distanceText})`);
    markers[id].setPopupContent(
      `${displayName}<br><small>Distance: ${distanceText}</small>`
    );
  }

  // Update user list whenever a marker is updated to refresh distances
  updateUserList();
}

socket.on("user-disconnected", (id) => {
  if (markers[id]) {
    map.removeLayer(markers[id]);
    delete markers[id];
    delete userData[id];
    updateUserCount();
  }
});

// Update user count display
function updateUserCount() {
  userCount = Object.keys(markers).length;
  userCountSpan.textContent = `Users: ${userCount}`;
  updateUserList();
}

// Update user list sidebar
function updateUserList() {
  const users = Object.keys(markers).map((id) => {
    const latLng = markers[id].getLatLng();
    let distance = null;

    // Calculate distance if we have current location
    if (currentLocation) {
      if (id === socket.id) {
        distance = 0; // Current user is 0m away
      } else {
        distance = calculateDistance(
          currentLocation.latitude,
          currentLocation.longitude,
          latLng.lat,
          latLng.lng
        );
      }
    }

    return {
      id,
      name: userData[id]?.name || "Anonymous",
      isCurrentUser: id === socket.id,
      marker: markers[id],
      latLng,
      distance,
    };
  });

  if (users.length === 0) {
    userListContent.innerHTML = '<p class="no-users">No users connected</p>';
    return;
  }

  userListContent.innerHTML = users
    .map((user) => {
      const locationText = `${user.latLng.lat.toFixed(
        4
      )}, ${user.latLng.lng.toFixed(4)}`;
      // Always show distance if we have current location
      let distanceText = "";
      if (user.distance !== null) {
        if (user.isCurrentUser) {
          distanceText = ` • You (0m)`;
        } else {
          distanceText = ` • ${formatDistance(user.distance)} away`;
        }
      }
      return `
        <div class="user-list-item ${user.isCurrentUser ? "current-user" : ""}" 
             data-user-id="${user.id}">
          <div class="user-name ${user.isCurrentUser ? "you" : ""}">
            ${user.name} ${user.isCurrentUser ? "(You)" : ""}
          </div>
          <div class="user-location">
            ${locationText}${distanceText}
          </div>
        </div>
      `;
    })
    .join("");

  // Add click handlers to center map on user
  userListContent.querySelectorAll(".user-list-item").forEach((item) => {
    item.addEventListener("click", () => {
      const userId = item.getAttribute("data-user-id");
      if (markers[userId]) {
        const latLng = markers[userId].getLatLng();
        map.setView(latLng, 16, { animate: true, duration: 0.5 });
        markers[userId].openPopup();
      }
    });
  });
}

// Toggle user list sidebar
toggleUserListBtn.addEventListener("click", () => {
  userListSidebar.classList.toggle("sidebar-hidden");
  userListSidebar.classList.toggle("sidebar-visible");
});

closeUserListBtn.addEventListener("click", () => {
  userListSidebar.classList.add("sidebar-hidden");
  userListSidebar.classList.remove("sidebar-visible");
});

// Cleanup on page unload
window.addEventListener("beforeunload", () => {
  if (locationWatchId) {
    navigator.geolocation.clearWatch(locationWatchId);
  }
});
