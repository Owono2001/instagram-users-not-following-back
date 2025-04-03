/**
 * Instagram Non-Follower Analyzer
 *
 * This script loads Instagram followers and following data (from JSON files),
 * identifies users who don't follow back, and provides
 * various features like search, sort, export, and visualization.
 */

// Wrap everything in an IIFE (Immediately Invoked Function Expression)
// to avoid polluting the global scope unnecessarily.
(function() {
  'use strict';

  // -------------------------------------------------------------------------
  // SECTION: Configuration & Constants
  // -------------------------------------------------------------------------

  const CONFIG = {
      // Default paths if loading static files (can be overridden by uploads)
      followersPath: 'followers_1.json',
      followingPath: 'following.json', // Corrected common filename
      batchSize: 500, // Process JSON data in chunks for performance
      // apiClientId: 'YOUR_INSTAGRAM_API_CLIENT_ID', // API removed
      // apiRedirectUri: window.location.origin + window.location.pathname // API removed
  };

  const LOADER_HTML = '<div class="loader">Loading data...</div>';
  const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js';

  // -------------------------------------------------------------------------
  // SECTION: State Management
  // -------------------------------------------------------------------------

  let state = {
      followers: new Set(),
      following: new Set(),
      // Store detailed user info if available, otherwise just usernames
      // Example: { username: 'user1', profileUrl: '...', timestamp: 123... }
      // For simplicity here based on original code, we'll store just usernames
      // and derive the nonFollowers list from the sets.
      nonFollowers: [], // Array of usernames who don't follow back
      uploadedFollowersData: null, // To store data from file uploads
      uploadedFollowingData: null, // To store data from file uploads
      sortAsc: true, // Sort order for the results list
      currentTheme: localStorage.getItem('theme') || 'light',
      // currentDataSource: 'json', // Defaulting to JSON as API is removed
      isDataProcessing: false,
      chartInstance: null // To hold the Chart.js instance
  };

  // -------------------------------------------------------------------------
  // SECTION: DOM Element References
  // -------------------------------------------------------------------------

  // Cache DOM elements for performance and easier access
  const dom = {
      container: document.getElementById('users-list'),
      searchInput: document.getElementById('searchInput'),
      stats: {
          followers: document.getElementById('totalFollowers'),
          following: document.getElementById('totalFollowing'),
          nonFollowers: document.getElementById('nonFollowersCount') // Renamed for clarity
      },
      themeToggleButton: document.getElementById('themeToggle'), // Assume button exists
      sortToggleButton: document.getElementById('sortToggle'), // Assume button exists
      exportButton: document.getElementById('exportButton'), // Assume button exists
      exportModal: document.getElementById('exportModal'),
      exportPreview: document.getElementById('exportPreview'),
      exportFormatSelect: document.getElementById('exportFormat'),
      exportIncludeDatesCheckbox: document.getElementById('includeDates'), // Assuming these exist
      exportCleanUsernamesCheckbox: document.getElementById('cleanUsernames'), // Assuming these exist
      exportPerformButton: document.getElementById('performExportButton'), // Assuming this exists
      exportModalCloseButton: document.querySelector('#exportModal .close'), // Assuming this exists
      timelineCanvas: document.getElementById('followTimeline'),
      aiSuggestionsContainer: document.getElementById('aiSuggestions'),
      // dataSourceButtons: document.querySelectorAll('.ds-btn'), // API removed
      jsonSourceContainer: document.getElementById('jsonSource'), // Container for JSON upload
      // apiSourceContainer: document.getElementById('apiSource'), // API removed
      followersFileInput: document.getElementById('followersFile'),
      followingFileInput: document.getElementById('followingFile'),
      // instagramLoginButton: document.getElementById('instagramLogin'), // API removed
      toastContainer: null // Will be created dynamically
  };

  // -------------------------------------------------------------------------
  // SECTION: Initialization
  // -------------------------------------------------------------------------

  /**
   * Main initialization function, sets up the application.
   */
  async function initializeApp() {
      showLoader();
      createToastContainer();
      applyTheme(); // Apply initial theme
      loadChartJs(); // Load Chart.js library
      setupEventListeners(); // Setup all event listeners

      // API related initialization removed

      // Always use JSON source now
      // setDataSourceInternal('json'); // No need to switch, default is JSON

      // Attempt to load static JSON files by default
      // File uploads will override this if used
      try {
          await Promise.all([
              loadStaticJsonData(CONFIG.followersPath, processFollowerData),
              loadStaticJsonData(CONFIG.followingPath, processFollowingData)
          ]);
          processLoadedData(); // Process data from static files
      } catch (error) {
          // Don't show fatal error yet, user might upload files
          console.warn(`Could not load static JSON files: ${error.message}`);
          showError("Could not load default JSON files. Please upload your files.", false); // Non-fatal error
          clearLoader(); // Clear loader if static load fails
      }


      // Initial render of placeholders if no data loaded yet
      if (state.followers.size === 0 && state.following.size === 0) {
          renderFollowTimeline(); // Render empty/placeholder chart
          generateSmartSuggestions(); // Render placeholder suggestions
      }
  }

  /**
   * Loads the Chart.js library dynamically.
   */
  function loadChartJs() {
      if (!document.querySelector(`script[src="${CHART_JS_URL}"]`)) {
          const chartScript = document.createElement('script');
          chartScript.src = CHART_JS_URL;
          chartScript.onerror = () => {
              console.error("Failed to load Chart.js");
              showToast("Could not load charting library.", "error");
          };
          document.head.appendChild(chartScript);
      }
  }



  // -------------------------------------------------------------------------
  // SECTION: Event Listener Setup
  // -------------------------------------------------------------------------

  function setupEventListeners() {
      if (dom.themeToggleButton) {
          dom.themeToggleButton.addEventListener('click', toggleTheme);
      }
      if (dom.sortToggleButton) {
          dom.sortToggleButton.addEventListener('click', toggleSort);
      }
      if (dom.searchInput) {
          dom.searchInput.addEventListener('input', debounce(renderResults, 300)); // Debounce search
      }
      if (dom.exportButton) {
          dom.exportButton.addEventListener('click', showExportModal);
      }
      if (dom.exportModalCloseButton) {
          dom.exportModalCloseButton.addEventListener('click', () => dom.exportModal.style.display = 'none');
      }
       if (dom.exportPerformButton) {
          dom.exportPerformButton.addEventListener('click', performExport);
      }
      // Add listeners for export options changing the preview
      if (dom.exportFormatSelect) dom.exportFormatSelect.addEventListener('change', updateExportPreview);
      if (dom.exportIncludeDatesCheckbox) dom.exportIncludeDatesCheckbox.addEventListener('change', updateExportPreview);
      if (dom.exportCleanUsernamesCheckbox) dom.exportCleanUsernamesCheckbox.addEventListener('change', updateExportPreview);


      // Data source switching removed as only JSON is available
      /*
      dom.dataSourceButtons.forEach(button => {
          button.addEventListener('click', (event) => {
              const source = event.target.getAttribute('data-source');
              if (source) {
                  setDataSourceInternal(source, true); // User initiated switch
                  // API related logic removed
              }
          });
      });
      */

      // File Upload listeners
      if (dom.followersFileInput) {
          dom.followersFileInput.addEventListener('change', handleFileUpload);
      }
      if (dom.followingFileInput) {
          dom.followingFileInput.addEventListener('change', handleFileUpload);
      }

      // API Login Button Listener Removed
      /*
       if (dom.instagramLoginButton) {
           dom.instagramLoginButton.addEventListener('click', redirectToInstagramAuth);
       }
      */

      // Event delegation for copy buttons in the user list
      if (dom.container) {
          dom.container.addEventListener('click', (event) => {
              const button = event.target.closest('.copy-btn');
              if (button) {
                  const username = button.getAttribute('data-username');
                  if (username) {
                      copyUsername(username);
                  }
              }
          });
      }

      // Event delegation for AI suggestion buttons
      if (dom.aiSuggestionsContainer) {
          dom.aiSuggestionsContainer.addEventListener('click', (event) => {
               const button = event.target.closest('.ai-action-btn');
               if (button) {
                   const actionName = button.getAttribute('data-action');
                   handleAiAction(actionName);
               }
          });
      }

      // Close modal if clicked outside
      window.addEventListener('click', (event) => {
          if (event.target === dom.exportModal) {
              dom.exportModal.style.display = 'none';
          }
      });
  }

  // -------------------------------------------------------------------------
  // SECTION: Data Loading & Parsing (JSON Focused)
  // -------------------------------------------------------------------------

  /**
   * Fetches JSON data from a static URL and processes it.
   * @param {string} url - The URL of the JSON file.
   * @param {Function} processor - Function to process each item in the JSON array.
   */
  async function loadStaticJsonData(url, processor) {
      if (state.isDataProcessing) return; // Prevent concurrent processing
      state.isDataProcessing = true;

      try {
          const response = await fetch(url);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

          const data = await response.json();
          // Handle potential object wrapping (e.g., { relationships_followers: [...] })
          const dataArray = Array.isArray(data) ? data : data[Object.keys(data)[0]];
          if (!Array.isArray(dataArray)) throw new Error('JSON data is not an array.');

          await processInBatches(dataArray, processor);
      } catch (error) {
          throw new Error(`Failed to load or parse ${url}: ${error.message}`);
      } finally {
           state.isDataProcessing = false;
      }
  }

  /**
   * Handles file selection from input elements.
   * @param {Event} event - The file input change event.
   */
  async function handleFileUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      const type = event.target.id.includes('followers') ? 'followers' : 'following';
      showLoader(); // Show loader during file processing

      try {
          const data = await parseJsonFile(file);
           // Handle potential object wrapping
          const dataArray = Array.isArray(data) ? data : data[Object.keys(data)[0]];
          if (!Array.isArray(dataArray)) throw new Error('Uploaded JSON is not an array.');

          if (type === 'followers') {
              state.uploadedFollowersData = dataArray;
              processFollowerDataBatch(state.uploadedFollowersData); // Process immediately
          } else {
              state.uploadedFollowingData = dataArray;
               processFollowingDataBatch(state.uploadedFollowingData); // Process immediately
          }
          checkUploadedDataReady();
      } catch (error) {
          showError(`Invalid ${type} file "${file.name}": ${error.message}`);
          // Clear the file input value to allow re-selection of the same file
          event.target.value = null;
          clearLoader();
      }
  }

   /**
   * Processes a batch of follower data (typically from upload).
   * @param {Array} dataArray - Array of follower relationship items.
   */
  function processFollowerDataBatch(dataArray) {
      state.followers.clear(); // Clear previous data if reprocessing
      // Instagram JSON structure has 'string_list_data' inside each item
      processFollowerData({ string_list_data: dataArray.flatMap(item => item.string_list_data || []) });
      console.log(`Processed ${state.followers.size} followers from upload.`);
  }

  /**
   * Processes a batch of following data (typically from upload).
   * @param {Array} dataArray - Array of following relationship items.
   */
  function processFollowingDataBatch(dataArray) {
      state.following.clear(); // Clear previous data if reprocessing
      // Instagram JSON structure might be different for following, adjust if necessary
      // Assuming similar structure:
      processFollowingData({ string_list_data: dataArray.flatMap(item => item.string_list_data || []) });
      console.log(`Processed ${state.following.size} following from upload.`);
  }


  /**
   * Parses a JSON file using FileReader.
   * @param {File} file - The file object to parse.
   * @returns {Promise<any>} - A promise resolving with the parsed JSON data.
   */
  function parseJsonFile(file) {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = e => {
              try {
                  if (e.target && typeof e.target.result === 'string') {
                       resolve(JSON.parse(e.target.result));
                  } else {
                       reject(new Error("Failed to read file content."));
                  }
              } catch (error) {
                  reject(new Error(`JSON Parse Error: ${error.message}`));
              }
          };
           reader.onerror = (e) => reject(new Error(`File Read Error: ${reader.error || 'Unknown error'}`));
          reader.readAsText(file);
      });
  }

  /**
   * Processes an array of data in batches to avoid blocking the UI thread.
   * @param {Array} data - The array of data to process.
   * @param {Function} processor - The function to call for each item.
   * @returns {Promise<void>}
   */
  function processInBatches(data, processor) {
      return new Promise(resolve => {
          let index = 0;
          const totalItems = data.length;

          function processBatch() {
              const end = Math.min(index + CONFIG.batchSize, totalItems);
              for (; index < end; index++) {
                  try {
                       processor(data[index]);
                  } catch (e) {
                       console.warn("Error processing item:", data[index], e);
                  }
              }

              // Update progress (optional)
               // updateProgressIndicator(index, totalItems);

              if (index < totalItems) {
                  setTimeout(processBatch, 0); // Yield to UI thread
              } else {
                  resolve();
              }
          }
          processBatch();
      });
  }

  /**
   * Extracts follower usernames from a data item.
   * Adds valid usernames to the state.followers Set.
   * @param {object} item - A relationship item from the followers JSON. Needs string_list_data property.
   */
  function processFollowerData(item) {
      // Expecting item = { string_list_data: [{timestamp: ..., value: '...', href: '...'}, ...] }
      item.string_list_data?.forEach(entry => {
          if (entry?.value) {
              state.followers.add(entry.value.toLowerCase());
          }
      });
  }

  /**
   * Extracts following usernames from a data item.
   * Adds valid usernames to the state.following Set.
   * @param {object} item - A relationship item from the following JSON. Needs string_list_data property.
   */
  function processFollowingData(item) {
      // Expecting item = { string_list_data: [{timestamp: ..., value: '...', href: '...'}, ...] }
      item.string_list_data?.forEach(entry => {
           if (entry?.value) {
              state.following.add(entry.value.toLowerCase());
          }
      });
  }

   /**
   * Checks if both follower and following data have been loaded (from uploads).
   * If ready, triggers the main data processing and UI update.
   */
  function checkUploadedDataReady() {
      if (state.uploadedFollowersData && state.uploadedFollowingData) {
          showToast("Files loaded. Processing data...", "info");
          // Data has already been processed into sets by processFollower/FollowingDataBatch
          processLoadedData();
      } else if (state.uploadedFollowersData) {
           showToast("Followers file loaded. Please upload the following file.", "info");
           clearLoader(); // Clear loader while waiting for the other file
      } else if (state.uploadedFollowingData) {
          showToast("Following file loaded. Please upload the followers file.", "info");
          clearLoader(); // Clear loader while waiting for the other file
      }
  }

  // -------------------------------------------------------------------------
  // SECTION: Core Data Processing Logic
  // -------------------------------------------------------------------------

  /**
   * Calculates the list of users who are being followed but don't follow back.
   * Updates the state.nonFollowers array.
   */
  function calculateNonFollowers() {
      state.nonFollowers = [...state.following].filter(user => !state.followers.has(user));
      // Sort initially based on current sort state
      state.nonFollowers.sort((a, b) => state.sortAsc ? a.localeCompare(b) : b.localeCompare(a));
      console.log(`Calculated ${state.nonFollowers.length} non-followers.`);
  }


  /**
  * Central function called after data is loaded (from static files or uploads).
  * Calculates differences and updates the entire UI.
  */
  function processLoadedData() {
      if (state.followers.size === 0 || state.following.size === 0) {
          console.log("Waiting for both follower and following data to be loaded.");
          return; // Don't proceed if one set is empty
      }

      showLoader(); // Ensure loader is visible during processing
      calculateNonFollowers();
      updateStatistics();
      renderResults(); // Render the list of non-followers
      renderFollowTimeline(); // Update or render the chart
      generateSmartSuggestions(); // Update suggestions based on data
      clearLoader(); // Hide loader after processing and rendering
      showToast("Analysis complete!", "success");
  }


  // -------------------------------------------------------------------------
  // SECTION: API Integration (REMOVED)
  // -------------------------------------------------------------------------

  // Functions redirectToInstagramAuth, handleAPIAuth, getAccessToken,
  // fetchRelationships, processAPIData have been removed or commented out.


  // -------------------------------------------------------------------------
  // SECTION: UI Rendering & Updates
  // -------------------------------------------------------------------------

  /**
   * Updates the statistics displayed on the page.
   */
  function updateStatistics() {
      if (!dom.stats.followers || !dom.stats.following || !dom.stats.nonFollowers) return;
      dom.stats.followers.textContent = state.followers.size;
      dom.stats.following.textContent = state.following.size;
      dom.stats.nonFollowers.textContent = state.nonFollowers.length;
  }

  /**
   * Renders the list of non-followers in the container.
   * Applies current search filter and sort order.
   */
  function renderResults() {
      if (!dom.container) return;

      // Get search term
      const searchTerm = dom.searchInput ? dom.searchInput.value.toLowerCase() : '';

      // Filter users based on search term
      const filteredUsers = state.nonFollowers.filter(user =>
          user.toLowerCase().includes(searchTerm)
      );

      // Sort the filtered list (state.nonFollowers is already sorted, but filter changes order)
      filteredUsers.sort((a, b) => state.sortAsc ? a.localeCompare(b) : b.localeCompare(a));

      // Clear previous results
      dom.container.innerHTML = '';

      if (filteredUsers.length === 0) {
          if (state.nonFollowers.length > 0 && searchTerm) {
              dom.container.innerHTML = '<p class="info">No users match your search.</p>';
          } else if (state.followers.size > 0 || state.following.size > 0) {
               // Only show "Everyone follows back" if data was actually processed
               dom.container.innerHTML = '<p class="info">Everyone you follow follows you back! 🎉</p>';
          } else {
               // Initial state or error state before data load
               // Keep the loader or initial message if appropriate
               if (!state.isDataProcessing && dom.container.querySelector('.loader')) {
                    dom.container.innerHTML = '<p class="info">Upload your followers & following JSON files to begin.</p>';
               } else if (!dom.container.querySelector('.loader')) {
                    // If loader was cleared due to an error or initial load failure
                    dom.container.innerHTML = '<p class="info">Upload your followers & following JSON files to begin.</p>';
               }
               // Otherwise, let the loader stay if it's still processing
          }
      } else {
          const fragment = document.createDocumentFragment();
          filteredUsers.forEach(user => {
              const userElement = createUserElement(user);
              fragment.appendChild(userElement);
          });
          dom.container.appendChild(fragment);
      }
  }


   /**
    * Creates a DOM element representing a single user.
    * @param {string} username - The username to display.
    * @returns {HTMLElement} - The created user element (div).
    */
   function createUserElement(username) {
       const userDiv = document.createElement('div');
       userDiv.className = 'user-item card'; // Added 'card' for consistency

       const userInfo = document.createElement('div');
       userInfo.className = 'user-info';

       const userLink = document.createElement('a');
       userLink.href = `https://www.instagram.com/${username}/`;
       userLink.textContent = `@${username}`;
       userLink.target = '_blank'; // Open in new tab
       userLink.rel = 'noopener noreferrer'; // Security best practice

       userInfo.appendChild(userLink);
       userDiv.appendChild(userInfo);

       const userActions = document.createElement('div');
       userActions.className = 'user-actions';

       // --- Unfollow Button (Example - Requires API or manual action) ---
       // This button doesn't actually unfollow via API anymore.
       // It could be repurposed or removed. Keeping as a visual placeholder.
       const unfollowButton = document.createElement('button');
       unfollowButton.className = 'btn-small unfollow-btn'; // Add specific class if needed
       unfollowButton.title = `Manually unfollow @${username} on Instagram`;
       unfollowButton.innerHTML = '<i class="fas fa-user-minus"></i> Unfollow';
       unfollowButton.onclick = () => {
            // No actual API call here
            showToast(`Open Instagram to unfollow @${username}`, 'info');
            // Optionally open the profile link automatically:
            // window.open(userLink.href, '_blank');
       };
       // userActions.appendChild(unfollowButton); // Uncomment if you want the placeholder button

        // --- Copy Button ---
       const copyButton = document.createElement('button');
       copyButton.className = 'btn-small copy-btn';
       copyButton.title = `Copy @${username} to clipboard`;
       copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy';
       copyButton.setAttribute('data-username', username); // Store username for the handler
       userActions.appendChild(copyButton);

       userDiv.appendChild(userActions);

       return userDiv;
   }

   /**
    * Copies the provided username to the clipboard.
    * @param {string} username - The username to copy.
    */
   function copyUsername(username) {
       navigator.clipboard.writeText(`@${username}`)
           .then(() => {
               showToast(`Copied @${username} to clipboard!`, 'success');
           })
           .catch(err => {
               console.error('Failed to copy username: ', err);
               showToast('Failed to copy username.', 'error');
           });
   }

   // -------------------------------------------------------------------------
   // SECTION: UI Toggles & Features (Theme, Sort, Export, Chart, AI)
   // -------------------------------------------------------------------------

   /**
    * Toggles the color theme between light and dark.
    */
   function toggleTheme() {
       state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light';
       localStorage.setItem('theme', state.currentTheme);
       applyTheme();
   }

   /**
    * Applies the current theme to the document body.
    */
   function applyTheme() {
       document.body.className = state.currentTheme + '-theme';
       if (dom.themeToggleButton) {
            const moonIcon = dom.themeToggleButton.querySelector('.fa-moon');
            const sunIcon = dom.themeToggleButton.querySelector('.fa-sun');
            if (moonIcon && sunIcon) {
                moonIcon.style.display = state.currentTheme === 'light' ? 'inline-block' : 'none';
                sunIcon.style.display = state.currentTheme === 'dark' ? 'inline-block' : 'none';
            }
       }
       // Update chart colors if chart exists
       if (state.chartInstance) {
           renderFollowTimeline(); // Re-render chart with new theme colors
       }
   }


   /**
    * Toggles the sort order of the results list and re-renders.
    */
   function toggleSort() {
       state.sortAsc = !state.sortAsc;
       // Update button text/icon
       if (dom.sortToggleButton) {
           const icon = dom.sortToggleButton.querySelector('i');
           if (state.sortAsc) {
               dom.sortToggleButton.innerHTML = '<i class="fas fa-sort-alpha-down"></i> Sort A-Z';
               if (icon) icon.className = 'fas fa-sort-alpha-down';
           } else {
               dom.sortToggleButton.innerHTML = '<i class="fas fa-sort-alpha-up"></i> Sort Z-A';
                if (icon) icon.className = 'fas fa-sort-alpha-up';
           }
       }
       renderResults(); // Re-render the list with the new sort order
   }

   /**
    * Displays the export modal.
    */
   function showExportModal() {
        if (state.nonFollowers.length === 0) {
           showToast("No non-followers to export.", "info");
           return;
        }
       if (dom.exportModal) {
           dom.exportModal.style.display = 'block';
           updateExportPreview(); // Show initial preview
       }
   }

   /**
    * Updates the preview in the export modal based on selected options.
    */
    function updateExportPreview() {
        if (!dom.exportPreview || !dom.exportFormatSelect) return;

        const format = dom.exportFormatSelect.value;
        const clean = dom.exportCleanUsernamesCheckbox?.checked || false;
        // Include dates functionality is placeholder for now
        // const includeDates = dom.exportIncludeDatesCheckbox?.checked || false;

        // Get a sample of users for preview (e.g., first 5)
        const previewUsers = state.nonFollowers.slice(0, 5);
        let previewText = '';

        if (previewUsers.length === 0) {
            previewText = "[No non-followers to preview]";
        } else {
            const processedUsers = previewUsers.map(user => clean ? user : `@${user}`);

            switch (format) {
                case 'txt':
                    previewText = processedUsers.join('\n');
                    break;
                case 'csv':
                    // Basic CSV: just a list of usernames
                    previewText = "Username\n" + processedUsers.join('\n');
                    break;
                case 'json':
                    // Simple JSON array
                    previewText = JSON.stringify(processedUsers, null, 2);
                    break;
                default:
                    previewText = "[Invalid format selected]";
            }
        }

        dom.exportPreview.textContent = previewText;
    }

   /**
    * Performs the export based on modal selections.
    */
   function performExport() {
       if (!dom.exportFormatSelect) return;

       const format = dom.exportFormatSelect.value;
       const clean = dom.exportCleanUsernamesCheckbox?.checked || false;
       // Placeholder: const includeDates = dom.exportIncludeDatesCheckbox?.checked || false;

       const usersToExport = state.nonFollowers.map(user => clean ? user : `@${user}`);

       if (usersToExport.length === 0) {
           showToast("Nothing to export.", "warning");
           return;
       }

       let fileContent = '';
       let mimeType = '';
       let fileExtension = '';

       switch (format) {
           case 'txt':
               fileContent = usersToExport.join('\n');
               mimeType = 'text/plain';
               fileExtension = 'txt';
               break;
           case 'csv':
               // Add header row
               fileContent = "Username\n" + usersToExport.join('\n');
               mimeType = 'text/csv';
               fileExtension = 'csv';
               break;
           case 'json':
               fileContent = JSON.stringify(usersToExport, null, 2);
               mimeType = 'application/json';
               fileExtension = 'json';
               break;
           default:
               showToast("Invalid export format selected.", "error");
               return;
       }

       // Create and trigger download
       try {
           const blob = new Blob([fileContent], { type: mimeType });
           const url = URL.createObjectURL(blob);
           const a = document.createElement('a');
           a.href = url;
           a.download = `instagram_non_followers_${new Date().toISOString().split('T')[0]}.${fileExtension}`;
           document.body.appendChild(a);
           a.click();
           document.body.removeChild(a);
           URL.revokeObjectURL(url);
           showToast(`Exported as ${fileExtension.toUpperCase()}`, "success");
           if (dom.exportModal) dom.exportModal.style.display = 'none'; // Close modal on success
       } catch (error) {
           console.error("Export failed:", error);
           showToast("Export failed. See console for details.", "error");
       }
   }

   /**
   * Renders a sample timeline chart using Chart.js.
   * Note: Uses placeholder data as actual timestamps aren't in basic JSON.
   */
  function renderFollowTimeline() {
    if (!dom.timelineCanvas || typeof Chart === 'undefined') {
        console.warn("Timeline canvas not found or Chart.js not loaded.");
        return; // Don't proceed if canvas or Chart.js is missing
    }

    const ctx = dom.timelineCanvas.getContext('2d');

    // Sample data - replace with real data if available
    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const followersData = [10, 25, 15, 30, 20, 40]; // Sample follower gains
    const unfollowersData = [5, 10, 8, 12, 9, 15]; // Sample unfollows (non-followers detected)

    // Destroy previous chart instance if it exists
    if (state.chartInstance) {
        state.chartInstance.destroy();
    }

    // Determine colors based on theme
    const isDarkMode = state.currentTheme === 'dark';
    const gridColor = isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
    const labelColor = isDarkMode ? '#e0e0e0' : '#333';
    const followerColor = '#1abc9c'; // Teal
    const unfollowerColor = '#e74c3c'; // Red

    state.chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'New Followers (Sample)',
                data: followersData,
                borderColor: followerColor,
                backgroundColor: followerColor + '33', // Semi-transparent fill
                tension: 0.1,
                fill: true
            }, {
                label: 'Non-Followers Detected (Sample)',
                data: unfollowersData,
                borderColor: unfollowerColor,
                backgroundColor: unfollowerColor + '33', // Semi-transparent fill
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: labelColor }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                }
            },
            scales: {
                x: {
                    grid: { color: gridColor },
                    ticks: { color: labelColor }
                },
                y: {
                    grid: { color: gridColor },
                    ticks: { color: labelColor },
                    beginAtZero: true
                }
            }
        }
    });
}


   /**
    * Generates simple "smart" suggestions based on the data.
    * (Placeholder implementation)
    */
   function generateSmartSuggestions() {
       if (!dom.aiSuggestionsContainer) return;

       dom.aiSuggestionsContainer.innerHTML = ''; // Clear previous suggestions

       if (state.nonFollowers.length === 0 && (state.followers.size > 0 || state.following.size > 0)) {
           dom.aiSuggestionsContainer.innerHTML = '<p class="ai-suggestion success"><i class="fas fa-check-circle"></i> Great job! Everyone you follow seems to follow you back.</p>';
           return;
       }

       if (state.nonFollowers.length === 0) {
           dom.aiSuggestionsContainer.innerHTML = '<p class="placeholder-text">Load data to see suggestions.</p>';
            return;
       }

       const fragment = document.createDocumentFragment();
        let suggestionCount = 0;

       // Suggestion 1: High number of non-followers
       if (state.nonFollowers.length > 50) {
            suggestionCount++;
           const suggestionDiv = document.createElement('div');
           suggestionDiv.className = 'ai-suggestion warning';
           suggestionDiv.innerHTML = `
               <i class="fas fa-exclamation-triangle"></i> You have a significant number (${state.nonFollowers.length}) of non-followers. Consider reviewing this list.
               <button class="btn-small ai-action-btn" data-action="focus-search" title="Focus search bar"><i class="fas fa-search"></i> Review List</button>
           `;
           fragment.appendChild(suggestionDiv);
       }

       // Suggestion 2: Follow/Following Ratio (Example)
       const ratio = state.followers.size / (state.following.size || 1); // Avoid division by zero
       if (state.following.size > 0 && ratio < 0.8) { // Example threshold: following significantly more than followers
           suggestionCount++;
           const suggestionDiv = document.createElement('div');
           suggestionDiv.className = 'ai-suggestion info';
           suggestionDiv.innerHTML = `
               <i class="fas fa-balance-scale-right"></i> Your follower/following ratio is ${ratio.toFixed(2)}. You're following quite a few more people than follow you back.
           `;
            fragment.appendChild(suggestionDiv);
       }

       // Suggestion 3: Offer export
        if (state.nonFollowers.length > 0) {
            suggestionCount++;
           const suggestionDiv = document.createElement('div');
           suggestionDiv.className = 'ai-suggestion';
           suggestionDiv.innerHTML = `
               <i class="fas fa-file-export"></i> You can export the list of ${state.nonFollowers.length} non-followers for external use.
               <button class="btn-small ai-action-btn" data-action="open-export" title="Open export options"><i class="fas fa-download"></i> Export Now</button>
           `;
            fragment.appendChild(suggestionDiv);
        }

       // Add a default message if no specific suggestions triggered
       if (suggestionCount === 0 && state.nonFollowers.length > 0) {
           const suggestionDiv = document.createElement('div');
           suggestionDiv.className = 'ai-suggestion';
           suggestionDiv.innerHTML = `<i class="fas fa-list-ul"></i> Found ${state.nonFollowers.length} users who don't follow you back.`;
           fragment.appendChild(suggestionDiv);
       }


       dom.aiSuggestionsContainer.appendChild(fragment);
   }

   /**
    * Handles actions triggered by buttons within AI suggestions.
    * @param {string} actionName - The value of the data-action attribute.
    */
   function handleAiAction(actionName) {
       switch(actionName) {
           case 'focus-search':
               dom.searchInput?.focus();
               showToast("Search bar focused.", "info");
               break;
           case 'open-export':
               showExportModal();
               break;
           // Add more cases for other actions
           default:
               console.warn("Unknown AI action:", actionName);
       }
   }

   // -------------------------------------------------------------------------
   // SECTION: Utility Functions (Loader, Error Handling, Toast, Debounce)
   // -------------------------------------------------------------------------

   /**
    * Shows the loading indicator.
    */
   function showLoader() {
       if (dom.container && !dom.container.querySelector('.loader')) {
            // Insert loader at the beginning of the container
            dom.container.insertAdjacentHTML('afterbegin', LOADER_HTML);
            state.isDataProcessing = true; // Also set state flag
       }
   }

   /**
    * Clears the loading indicator.
    */
   function clearLoader() {
       const loader = dom.container ? dom.container.querySelector('.loader') : null;
       if (loader) {
           loader.remove();
       }
       state.isDataProcessing = false; // Clear state flag
   }

   /**
    * Displays an error message in the main container.
    * @param {string} message - The error message to display.
    * @param {boolean} clearPrevious - Whether to clear previous content. Defaults to true.
    */
   function showError(message, clearPrevious = true) {
       console.error("Error:", message);
       if (dom.container) {
           if(clearPrevious) dom.container.innerHTML = ''; // Clear previous content like loader or results
           const errorElement = document.createElement('p');
           errorElement.className = 'error';
           errorElement.textContent = `Error: ${message}`;
           dom.container.appendChild(errorElement);
       }
       showToast(message, "error"); // Show toast notification as well
   }

    /**
    * Creates the container for toast notifications if it doesn't exist.
    */
   function createToastContainer() {
       if (!dom.toastContainer) {
           dom.toastContainer = document.createElement('div');
           dom.toastContainer.id = 'toast-container';
           document.body.appendChild(dom.toastContainer);
       }
   }

   /**
    * Shows a toast notification.
    * @param {string} message - The message to display.
    * @param {'info' | 'success' | 'warning' | 'error'} type - The type of toast.
    * @param {number} duration - How long to display the toast in ms.
    */
   function showToast(message, type = 'info', duration = 3000) {
        if (!dom.toastContainer) createToastContainer(); // Ensure container exists

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;

        // Add icon based on type
        let iconClass = 'fas fa-info-circle'; // Default to info
        if (type === 'success') iconClass = 'fas fa-check-circle';
        else if (type === 'warning') iconClass = 'fas fa-exclamation-triangle';
        else if (type === 'error') iconClass = 'fas fa-times-circle';

        toast.innerHTML = `<i class="${iconClass}"></i> ${message}`;

        dom.toastContainer.appendChild(toast);

        // Trigger fade in animation (optional, needs CSS)
        setTimeout(() => toast.classList.add('show'), 10);

        // Remove toast after duration
        setTimeout(() => {
            toast.classList.remove('show');
            // Remove element after fade out animation completes
            toast.addEventListener('transitionend', () => toast.remove());
            // Fallback removal if no transition
            setTimeout(() => {
                 if (toast.parentNode === dom.toastContainer) {
                    toast.remove();
                 }
            }, 500); // Wait for potential CSS transition
        }, duration);
    }

   /**
    * Debounce function to limit the rate at which a function can fire.
    * @param {Function} func - The function to debounce.
    * @param {number} wait - The debounce duration in milliseconds.
    * @returns {Function} - The debounced function.
    */
   function debounce(func, wait) {
       let timeout;
       return function executedFunction(...args) {
           const later = () => {
               clearTimeout(timeout);
               func(...args);
           };
           clearTimeout(timeout);
           timeout = setTimeout(later, wait);
       };
   }

  // -------------------------------------------------------------------------
  // SECTION: Application Start
  // -------------------------------------------------------------------------

  // Wait for the DOM to be fully loaded before initializing
  document.addEventListener('DOMContentLoaded', initializeApp);

})(); // End of IIFE