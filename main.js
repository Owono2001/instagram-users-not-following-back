/**
 * Instagram Non-Follower Analyzer
 *
 * This script loads Instagram followers and following data (from JSON files),
 * identifies users who don't follow back, and provides
 * various features like search, sort, export, visualization, and theme toggling.
 */

// Wrap everything in an IIFE
(function() {
  'use strict';

  // -------------------------------------------------------------------------
  // SECTION: Configuration & Constants
  // -------------------------------------------------------------------------

  const CONFIG = {
      followersPath: 'followers_1.json',
      followingPath: 'following.json',
      batchSize: 500,
      debounceTime: 300, // ms for search input debounce
      toastDuration: 3000 // ms for toast notifications
  };

  const LOADER_HTML = `<div class="loader absolute"><div class="loader-inner">Loading data...</div></div>`; // Use absolute loader
  const CHART_JS_URL = 'https://cdn.jsdelivr.net/npm/chart.js'; // Keep loading Chart.js

  // -------------------------------------------------------------------------
  // SECTION: State Management
  // -------------------------------------------------------------------------

  let state = {
      followers: new Set(),
      following: new Set(),
      nonFollowers: [], // Array of usernames who don't follow back
      uploadedFollowersData: null,
      uploadedFollowingData: null,
      sortAsc: true,
      // Read theme from localStorage or default to light
      currentTheme: localStorage.getItem('theme') || 'light',
      isDataProcessing: false,
      chartInstance: null,
      // Store file load status for better feedback
      followersFileLoaded: false,
      followingFileLoaded: false,
  };

  // -------------------------------------------------------------------------
  // SECTION: DOM Element References (Cache them)
  // -------------------------------------------------------------------------

  const dom = {
      htmlElement: document.documentElement, // Target for theme class
      container: document.getElementById('users-list'),
      listPlaceholder: document.querySelector('#users-list .list-placeholder'),
      searchInput: document.getElementById('searchInput'),
      stats: {
          followers: document.getElementById('totalFollowers'),
          following: document.getElementById('totalFollowing'),
          nonFollowers: document.getElementById('nonFollowersCount')
      },
      themeToggleButton: document.getElementById('themeToggle'),
      sortToggleButton: document.getElementById('sortToggle'),
      sortToggleText: document.querySelector('#sortToggle .sort-text'),
      exportButton: document.getElementById('exportButton'),
      exportModal: document.getElementById('exportModal'),
      exportPreview: document.getElementById('exportPreview'),
      exportFormatSelect: document.getElementById('exportFormat'),
      exportCleanUsernamesCheckbox: document.getElementById('cleanUsernames'),
      exportPerformButton: document.getElementById('performExportButton'),
      exportModalCloseButton: document.querySelector('#exportModal .close'),
      timelineCanvas: document.getElementById('followTimeline'),
      chartWrapper: document.querySelector('.chart-wrapper'), // Get wrapper for placeholder
      chartPlaceholder: document.querySelector('.chart-placeholder'),
      aiSuggestionsContainer: document.getElementById('aiSuggestions'),
      jsonSourceContainer: document.getElementById('jsonSource'),
      followersFileInput: document.getElementById('followersFile'),
      followingFileInput: document.getElementById('followingFile'),
      followersFileNameDisplay: document.getElementById('followersFileName'),
      followingFileNameDisplay: document.getElementById('followingFileName'),
      initialLoadErrorDisplay: document.getElementById('initial-load-error'),
      toastContainer: document.getElementById('toastContainer') // Get existing container
  };

  // -------------------------------------------------------------------------
  // SECTION: Initialization
  // -------------------------------------------------------------------------

  /**
   * Main initialization function.
   */
  async function initializeApp() {
      // Don't show global loader immediately, handle section loaders
      // showLoader(dom.container); // Example: Loader specific to user list

      // createToastContainer(); // Using existing container now
      applyTheme(); // Apply initial theme *before* setup
      // loadChartJs(); // Chart.js included via <script> tag now
      setupEventListeners();

      // Clear file input values on page load in case of refresh
      if (dom.followersFileInput) dom.followersFileInput.value = null;
      if (dom.followingFileInput) dom.followingFileInput.value = null;


      // Attempt to load static JSON files (optional, maybe remove if only uploads are desired)
      // try {
      //     console.log("Attempting to load static JSON files...");
      //     await Promise.allSettled([ // Use allSettled to handle potential failures gracefully
      //         loadStaticJsonData(CONFIG.followersPath, processFollowerData, 'followers'),
      //         loadStaticJsonData(CONFIG.followingPath, processFollowingData, 'following')
      //     ]);
      //     if (state.followersFileLoaded && state.followingFileLoaded) {
      //         console.log("Static files loaded successfully.");
      //         processLoadedData();
      //     } else {
      //          console.warn("Could not load one or both static JSON files.");
      //          showInitialLoadError();
      //     }
      // } catch (error) { // Should not happen with allSettled unless fetch itself fails badly
      //     console.error(`Error during static JSON loading: ${error.message}`);
      //     showInitialLoadError();
      // }

      // Render initial state of UI elements
       updateStatistics(); // Show 0s initially
      renderFollowTimeline(); // Render empty/placeholder chart
      generateSmartSuggestions(); // Render placeholder suggestions
      updateSortButtonUI(); // Set initial sort button text/icons
       // Display initial placeholder in list if not loading
      if (!state.isDataProcessing && dom.listPlaceholder) {
          dom.listPlaceholder.style.display = 'flex';
      }
  }

  /** Dynamically loading Chart.js (if preferred over script tag)
   function loadChartJs() {
      if (typeof Chart === 'undefined' && !document.querySelector(`script[src="${CHART_JS_URL}"]`)) {
          const chartScript = document.createElement('script');
          chartScript.src = CHART_JS_URL;
          chartScript.onload = () => {
              console.log("Chart.js loaded dynamically.");
              // Potentially re-render chart if data is ready
              if (state.nonFollowers.length > 0 || state.followers.size > 0) {
                 renderFollowTimeline();
              }
          };
          chartScript.onerror = () => {
              console.error("Failed to load Chart.js");
              showToast("Could not load charting library.", "error");
              if(dom.chartPlaceholder) dom.chartPlaceholder.innerHTML = '<p>Failed to load Chart library.</p>';
          };
          document.head.appendChild(chartScript);
      } else if (typeof Chart !== 'undefined') {
          console.log("Chart.js already available.");
      }
  }
  */

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
          dom.searchInput.addEventListener('input', debounce(handleSearchInput, CONFIG.debounceTime));
      }
      if (dom.exportButton) {
          dom.exportButton.addEventListener('click', showExportModal);
      }
      if (dom.exportModalCloseButton) {
          dom.exportModalCloseButton.addEventListener('click', hideExportModal);
      }
      if (dom.exportPerformButton) {
          dom.exportPerformButton.addEventListener('click', performExport);
      }
      // Update preview on option change
      if (dom.exportFormatSelect) dom.exportFormatSelect.addEventListener('change', updateExportPreview);
      if (dom.exportCleanUsernamesCheckbox) dom.exportCleanUsernamesCheckbox.addEventListener('change', updateExportPreview);

      // File Upload listeners
      if (dom.followersFileInput) {
          dom.followersFileInput.addEventListener('change', handleFileUpload);
      }
      if (dom.followingFileInput) {
          dom.followingFileInput.addEventListener('change', handleFileUpload);
      }

      // Event delegation for copy buttons
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

      // Event delegation for AI suggestion buttons (if actions added later)
      // if (dom.aiSuggestionsContainer) {
      //     dom.aiSuggestionsContainer.addEventListener('click', (event) => {
      //         const button = event.target.closest('.ai-action-btn');
      //         if (button) {
      //             const actionName = button.getAttribute('data-action');
      //             handleAiAction(actionName); // Define handleAiAction if needed
      //         }
      //     });
      // }

      // Close modal if clicked outside content
      window.addEventListener('click', (event) => {
          if (event.target === dom.exportModal) {
              hideExportModal();
          }
      });
  }

  // -------------------------------------------------------------------------
  // SECTION: Data Loading & Parsing (JSON Focused)
  // -------------------------------------------------------------------------

   /**
    * Handles search input, triggers rendering.
    */
    function handleSearchInput() {
        renderResults(); // Re-render the list based on the search term
    }


   /**
     * Fetches JSON data from a static URL. (Optional - if using default files)
     * @param {string} url - The URL of the JSON file.
     * @param {Function} processor - Function to process each item.
     * @param {string} type - 'followers' or 'following'.
    */
    async function loadStaticJsonData(url, processor, type) {
        // Removed batch processing here for simplicity with static files,
        // assuming they are reasonably sized. Re-add if needed.
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status} for ${url}`);
            }
            const data = await response.json();
            const dataArray = extractDataArray(data); // Use helper function

            if (type === 'followers') {
                processFollowerData({ string_list_data: dataArray.flatMap(item => item.string_list_data || []) });
                state.followersFileLoaded = true;
            } else {
                processFollowingData({ string_list_data: dataArray.flatMap(item => item.string_list_data || []) });
                state.followingFileLoaded = true;
            }
            console.log(`Successfully loaded and processed static ${type} data.`);

        } catch (error) {
            console.error(`Failed to load or parse static ${type} file (${url}): ${error.message}`);
            // Don't show fatal error here, let initializeApp handle overall status
             state[type === 'followers' ? 'followersFileLoaded' : 'followingFileLoaded'] = false; // Mark as failed
             throw error; // Re-throw to be caught by Promise.allSettled
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
      const containerToShowLoader = dom.jsonSourceContainer; // Show loader in the upload area
      showLoader(containerToShowLoader);

      try {
          const data = await parseJsonFile(file);
          const dataArray = extractDataArray(data); // Use helper function

          // Clear previous data for this type before processing new file
          if (type === 'followers') {
              state.followers.clear();
              state.uploadedFollowersData = dataArray; // Keep raw structure if needed
              processFollowerDataBatch(dataArray); // Process immediately
              state.followersFileLoaded = true;
              dom.followersFileNameDisplay.textContent = file.name; // Update display again to be sure
              dom.followersFileNameDisplay.classList.add('selected');
          } else {
              state.following.clear();
              state.uploadedFollowingData = dataArray; // Keep raw structure if needed
              processFollowingDataBatch(dataArray); // Process immediately
              state.followingFileLoaded = true;
              dom.followingFileNameDisplay.textContent = file.name;
              dom.followingFileNameDisplay.classList.add('selected');
          }

          showToast(`${type.charAt(0).toUpperCase() + type.slice(1)} file "${file.name}" loaded.`, "success");
          checkAllDataReady(); // Check if both files are now loaded

      } catch (error) {
          showError(`Error processing ${type} file "${file.name}": ${error.message}`, true); // Show as toast
          // Clear the file input value and reset display
          event.target.value = null;
           const fileNameDisplay = type === 'followers' ? dom.followersFileNameDisplay : dom.followingFileNameDisplay;
           if (fileNameDisplay) {
                fileNameDisplay.textContent = 'No file selected';
                fileNameDisplay.classList.remove('selected');
           }
          // Mark as not loaded
          state[type === 'followers' ? 'followersFileLoaded' : 'followingFileLoaded'] = false;

      } finally {
          clearLoader(containerToShowLoader);
      }
  }

    /**
    * Helper to extract the core data array, handling potential object wrapping.
    * Expects [{string_list_data: [...]}, ...] or { relationships_followers: [{string_list_data: [...]}, ...]} etc.
    * @param {any} data - Parsed JSON data.
    * @returns {Array} - The extracted array of relationship items.
    */
   function extractDataArray(data) {
        if (Array.isArray(data)) {
            return data; // Already an array
        }
        if (typeof data === 'object' && data !== null) {
            // Check for common Instagram export keys
            const potentialKeys = ['relationships_followers', 'relationships_following', 'relationships_unfollowed_users', 'string_map_data'];
            for (const key of potentialKeys) {
                if (Array.isArray(data[key])) {
                    return data[key];
                }
            }
            // Fallback: Check if the first property is an array
            const firstKey = Object.keys(data)[0];
            if (firstKey && Array.isArray(data[firstKey])) {
                return data[firstKey];
            }
        }
        // If it's neither an array nor a recognized wrapped object, throw error
        throw new Error('JSON data structure not recognized. Expected an array or a common wrapper object (e.g., { relationships_followers: [...] }).');
   }

  /**
   * Processes a batch of follower data (from upload).
   * Expects dataArray = [{string_list_data: [{value:'user',...},...]}, ...]
   * @param {Array} dataArray - Array of follower relationship items.
   */
  function processFollowerDataBatch(dataArray) {
      state.followers.clear(); // Ensure it's clear before adding
      // The actual user info is nested within string_list_data
      dataArray.forEach(item => {
          item?.string_list_data?.forEach(entry => {
              if (entry?.value) {
                  state.followers.add(entry.value.toLowerCase());
              }
          });
      });
      console.log(`Processed ${state.followers.size} followers from file.`);
  }

  /**
   * Processes a batch of following data (from upload).
   * Expects dataArray = [{string_list_data: [{value:'user',...},...]}, ...]
   * @param {Array} dataArray - Array of following relationship items.
   */
  function processFollowingDataBatch(dataArray) {
      state.following.clear(); // Ensure it's clear
      dataArray.forEach(item => {
          item?.string_list_data?.forEach(entry => {
              if (entry?.value) {
                  state.following.add(entry.value.toLowerCase());
              }
          });
      });
      console.log(`Processed ${state.following.size} following from file.`);
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
                  reject(new Error(`Invalid JSON: ${error.message}`));
              }
          };
          reader.onerror = (e) => reject(new Error(`File Read Error: ${reader.error || 'Unknown error'}`));
          reader.readAsText(file);
      });
  }

   /**
    * Process data items potentially found directly in the root array
    * Used by the static file loader which might point directly to string_list_data
    * @param {object} item - A relationship item {timestamp: ..., value: '...', href: '...'}
    */
   function processFollowerData(item) {
        // Adapting for potential direct item processing if static files are structured differently
        if (item?.string_list_data) { // Handle the standard wrapper object
            item.string_list_data?.forEach(entry => {
                if (entry?.value) {
                    state.followers.add(entry.value.toLowerCase());
                }
            });
        } else if (item?.value) { // Handle a direct entry item
             state.followers.add(item.value.toLowerCase());
        }
   }

   /**
    * Process data items potentially found directly in the root array
    * @param {object} item - A relationship item {timestamp: ..., value: '...', href: '...'}
    */
   function processFollowingData(item) {
       if (item?.string_list_data) { // Handle the standard wrapper object
            item.string_list_data?.forEach(entry => {
                if (entry?.value) {
                    state.following.add(entry.value.toLowerCase());
                }
            });
       } else if (item?.value) { // Handle a direct entry item
             state.following.add(item.value.toLowerCase());
       }
   }


  /**
   * Checks if both follower and following data are ready (from any source).
   * If ready, triggers the main analysis and UI update.
   */
  function checkAllDataReady() {
      if (state.followersFileLoaded && state.followingFileLoaded) {
          showToast("Both files loaded. Analyzing...", "info");
          processLoadedData();
      } else if (state.followersFileLoaded) {
          showToast("Followers file loaded. Upload the 'following.json' file.", "info");
      } else if (state.followingFileLoaded) {
          showToast("Following file loaded. Upload the 'followers_1.json' file.", "info");
      }
      // else: neither file loaded yet, do nothing
  }

  // -------------------------------------------------------------------------
  // SECTION: Core Data Processing Logic
  // -------------------------------------------------------------------------

  /**
   * Calculates the list of users who don't follow back.
   */
  function calculateNonFollowers() {
      // Ensure Sets are populated before calculation
      if (state.following.size === 0) {
          console.warn("Following list is empty, cannot calculate non-followers.");
          state.nonFollowers = [];
          return;
      }
       // Followers list might be empty, that's okay (means everyone you follow doesn't follow back)

      state.nonFollowers = [...state.following].filter(user => !state.followers.has(user));
      sortNonFollowers(); // Apply initial sort
      console.log(`Calculated ${state.nonFollowers.length} non-followers.`);
  }

    /**
    * Sorts the state.nonFollowers array based on state.sortAsc.
    */
   function sortNonFollowers() {
        state.nonFollowers.sort((a, b) => {
            const compare = a.localeCompare(b);
            return state.sortAsc ? compare : -compare;
        });
   }

  /**
   * Central function called after both data sets are loaded.
   */
  function processLoadedData() {
      if (!state.followersFileLoaded || !state.followingFileLoaded) {
          console.log("Waiting for both follower and following data.");
          return;
      }
       if (state.isDataProcessing) return; // Prevent double processing

       state.isDataProcessing = true;
      showLoader(dom.container); // Show loader in the results list area

      try {
            calculateNonFollowers();
            updateStatistics();
            renderResults(); // Render the list
            renderFollowTimeline(); // Update the chart
            generateSmartSuggestions(); // Update suggestions
            showToast("Analysis complete!", "success");
            if (dom.listPlaceholder) dom.listPlaceholder.style.display = 'none'; // Hide placeholder
      } catch (error) {
            console.error("Error during final data processing:", error);
            showError("An error occurred during analysis.", true);
            if (dom.listPlaceholder) dom.listPlaceholder.style.display = 'flex'; // Show placeholder on error
      } finally {
            clearLoader(dom.container);
            state.isDataProcessing = false;
      }
  }

  // -------------------------------------------------------------------------
  // SECTION: UI Rendering & Updates
  // -------------------------------------------------------------------------

  /**
   * Updates the statistics display.
   */
  function updateStatistics() {
      if (!dom.stats.followers || !dom.stats.following || !dom.stats.nonFollowers) return;
      // Animate the numbers changing? (Optional enhancement)
      dom.stats.followers.textContent = state.followers.size;
      dom.stats.following.textContent = state.following.size;
      dom.stats.nonFollowers.textContent = state.nonFollowers.length;
  }

  /**
   * Renders the list of non-followers.
   */
  function renderResults() {
      if (!dom.container) return;

      // Ensure data has been processed before rendering
       // Don't render if still waiting for files
       if (!state.followersFileLoaded || !state.followingFileLoaded || state.isDataProcessing) {
           // If placeholder exists, ensure it's visible unless loading
           if (dom.listPlaceholder && !state.isDataProcessing) {
               dom.listPlaceholder.style.display = 'flex';
               dom.container.innerHTML = ''; // Clear any previous list items
               dom.container.appendChild(dom.listPlaceholder); // Make sure it's there
           } else if (!dom.listPlaceholder && !state.isDataProcessing){
                // Fallback if placeholder was removed somehow
               dom.container.innerHTML = '<p class="info">Upload files to begin.</p>';
           }
           // If loading, the loader should be visible already
           return;
       }


      const searchTerm = dom.searchInput ? dom.searchInput.value.toLowerCase().trim() : '';
      const filteredUsers = searchTerm
          ? state.nonFollowers.filter(user => user.toLowerCase().includes(searchTerm))
          : [...state.nonFollowers]; // Use a copy if no search term

      // No need to re-sort here if state.nonFollowers is always kept sorted
      // filteredUsers.sort((a, b) => state.sortAsc ? a.localeCompare(b) : b.localeCompare(a));

       // Clear previous results OR the placeholder
      dom.container.innerHTML = '';
      if (dom.listPlaceholder) dom.listPlaceholder.style.display = 'none';


      if (filteredUsers.length === 0) {
          if (state.nonFollowers.length > 0 && searchTerm) {
              dom.container.innerHTML = '<p class="info">No users match your search.</p>';
          } else if (state.nonFollowers.length === 0 && (state.followers.size > 0 || state.following.size > 0)) {
               // Only show if data was loaded and nonFollowers is genuinely zero
              dom.container.innerHTML = '<p class="info">🎉 Good news! Everyone you follow follows you back.</p>';
          } else {
              // Fallback / Initial state message (should ideally be handled by placeholder)
              dom.container.innerHTML = '<p class="info">Upload your followers & following JSON files to see results.</p>';
               if (dom.listPlaceholder) dom.listPlaceholder.style.display = 'flex'; // Show placeholder again
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
   * Creates a DOM element for a single user.
   * @param {string} username - The username.
   * @returns {HTMLElement} - The user element (div).
   */
  function createUserElement(username) {
      const userDiv = document.createElement('div');
      userDiv.className = 'user-item'; // Use card styling from CSS

      const userInfo = document.createElement('div');
      userInfo.className = 'user-info';

      const userLink = document.createElement('a');
      userLink.href = `https://www.instagram.com/${username}/`;
      userLink.textContent = `@${username}`;
      userLink.target = '_blank';
      userLink.rel = 'noopener noreferrer';
      userLink.title = `View @${username} on Instagram`;

      userInfo.appendChild(userLink);
      userDiv.appendChild(userInfo);

      const userActions = document.createElement('div');
      userActions.className = 'user-actions';

      // Copy Button
      const copyButton = document.createElement('button');
      copyButton.className = 'btn-small copy-btn';
      copyButton.title = `Copy @${username}`;
      copyButton.innerHTML = '<i class="fas fa-copy"></i> Copy';
      copyButton.setAttribute('data-username', username);
      userActions.appendChild(copyButton);

      // Optional: Add placeholder 'Unfollow' button that just opens profile
       const openProfileButton = document.createElement('button');
       openProfileButton.className = 'btn-small'; // Use default secondary style
       openProfileButton.title = `Open @${username}'s profile`;
       openProfileButton.innerHTML = '<i class="fas fa-external-link-alt"></i> Profile';
       openProfileButton.onclick = () => window.open(userLink.href, '_blank');
       userActions.appendChild(openProfileButton);


      userDiv.appendChild(userActions);
      return userDiv;
  }

  /**
   * Copies username to clipboard.
   * @param {string} username - Username to copy.
   */
  function copyUsername(username) {
      if (!navigator.clipboard) {
          showToast('Clipboard API not available in this browser.', 'error');
          return;
      }
      navigator.clipboard.writeText(`@${username}`)
          .then(() => {
              showToast(`Copied @${username}!`, 'success');
          })
          .catch(err => {
              console.error('Failed to copy username: ', err);
              showToast('Failed to copy username.', 'error');
          });
  }

   /**
    * Shows the initial load error message.
    */
   function showInitialLoadError() {
       if (dom.initialLoadErrorDisplay) {
           dom.initialLoadErrorDisplay.style.display = 'block';
       }
   }

  // -------------------------------------------------------------------------
  // SECTION: UI Toggles & Features
  // -------------------------------------------------------------------------

  /**
   * Toggles the color theme.
   */
  function toggleTheme() {
      state.currentTheme = state.currentTheme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', state.currentTheme);
      applyTheme();
      // Re-render chart with new theme colors
      renderFollowTimeline(true); // Pass true to indicate theme change
  }

  /**
   * Applies the current theme to the body.
   */
  function applyTheme() {
      // Remove existing theme classes
      dom.htmlElement.classList.remove('light-theme', 'dark-theme');
      // Add the current theme class
      dom.htmlElement.classList.add(`${state.currentTheme}-theme`);
      console.log(`Theme applied: ${state.currentTheme}-theme`);
  }

  /**
   * Toggles the sort order and re-renders the results.
   */
  function toggleSort() {
      state.sortAsc = !state.sortAsc;
      sortNonFollowers(); // Re-sort the main list
      renderResults(); // Re-render the list with the new order
      updateSortButtonUI();
      showToast(`Sorted ${state.sortAsc ? 'A-Z' : 'Z-A'}`, 'info');
  }

   /**
    * Updates the Sort button text and icon based on state.sortAsc.
    */
   function updateSortButtonUI() {
       if (!dom.sortToggleButton || !dom.sortToggleText) return;
        dom.sortToggleText.textContent = state.sortAsc ? 'Sort A-Z' : 'Sort Z-A';
        if (state.sortAsc) {
            dom.sortToggleButton.classList.add('asc');
        } else {
            dom.sortToggleButton.classList.remove('asc');
        }
   }

  /**
   * Shows the export modal.
   */
  function showExportModal() {
      if (state.nonFollowers.length === 0) {
          showToast("No non-followers to export.", "info");
          return;
      }
      if (dom.exportModal) {
          updateExportPreview(); // Generate initial preview
          dom.exportModal.style.display = 'block';
      }
  }

   /** Hides the export modal */
   function hideExportModal() {
        if (dom.exportModal) {
            dom.exportModal.style.display = 'none';
        }
   }


  /**
   * Generates the text content for export based on options.
   * @returns {string} - Formatted text for export/preview.
   */
  function generateExportContent() {
      const format = dom.exportFormatSelect ? dom.exportFormatSelect.value : 'txt';
      const cleanUsernames = dom.exportCleanUsernamesCheckbox ? dom.exportCleanUsernamesCheckbox.checked : false;
      // const includeDates = dom.exportIncludeDatesCheckbox ? dom.exportIncludeDatesCheckbox.checked : false; // Add later if needed

      let content = '';
      const usersToExport = state.nonFollowers.map(user => cleanUsernames ? user : `@${user}`);

      switch (format) {
          case 'csv':
              content = `Username\n${usersToExport.join('\n')}`;
              break;
          case 'json':
              content = JSON.stringify({ nonFollowers: usersToExport }, null, 2);
              break;
          case 'txt':
          default:
              content = usersToExport.join('\n');
              break;
      }
      return content;
  }

  /**
   * Updates the export preview text area.
   */
  function updateExportPreview() {
      if (!dom.exportPreview || !dom.exportModal || dom.exportModal.style.display === 'none') return;

      const previewContent = generateExportContent();
      // Show only a portion in the preview
      const previewLines = previewContent.split('\n');
      const maxPreviewLines = 10;
       if (previewLines.length > maxPreviewLines) {
           dom.exportPreview.textContent = previewLines.slice(0, maxPreviewLines).join('\n') + '\n...';
       } else {
           dom.exportPreview.textContent = previewContent;
       }
  }

  /**
   * Performs the actual file export.
   */
  function performExport() {
      const format = dom.exportFormatSelect ? dom.exportFormatSelect.value : 'txt';
      const content = generateExportContent();
      const blob = new Blob([content], { type: `text/${format === 'json' ? 'json' : (format === 'csv' ? 'csv' : 'plain')};charset=utf-8` });
      const url = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = `instagram_non_followers_${new Date().toISOString().slice(0, 10)}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showToast(`Exported as ${format.toUpperCase()} file.`, 'success');
      hideExportModal();
  }

  /**
   * Renders the follow/unfollow timeline chart (using sample data).
   * @param {boolean} themeChanged - Indicates if this render is due to a theme change.
   */
  function renderFollowTimeline(themeChanged = false) {
       if (typeof Chart === 'undefined') {
           console.warn("Chart.js is not loaded yet.");
           if(dom.chartPlaceholder) dom.chartPlaceholder.innerHTML = '<p><i class="fas fa-exclamation-circle"></i> Chart library not loaded.</p>';
           return;
       }
        if (!dom.timelineCanvas || !dom.chartWrapper) return;

        // Destroy existing chart if it exists, especially on theme change
       if (state.chartInstance) {
           state.chartInstance.destroy();
           state.chartInstance = null;
       }


       // Hide placeholder, show canvas
       if(dom.chartPlaceholder) dom.chartPlaceholder.style.display = 'none';
       dom.timelineCanvas.style.display = 'block';


       // --- Sample Data (Replace with real data if available) ---
       const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'];
       const followersData = [10, 15, 12, 18, 25, 22, 30]; // Sample gained
       const unfollowersData = [-2, -1, -3, 0, -5, -2, -1]; // Sample lost (represented negative for clarity)
       // --- End Sample Data ---

       // Get theme-specific colors
       const gridColor = state.currentTheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';
       const textColor = state.currentTheme === 'dark' ? '#e9ecef' : '#343a40';
       const followerColor = state.currentTheme === 'dark' ? '#198754' : '#28a745'; // Greenish for followers
       const unfollowerColor = state.currentTheme === 'dark' ? '#dc3545' : '#dc3545'; // Reddish for unfollowers


       try {
            const ctx = dom.timelineCanvas.getContext('2d');
            state.chartInstance = new Chart(ctx, {
                type: 'line', // Could be 'bar' as well
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'New Followers',
                            data: followersData,
                            borderColor: followerColor,
                            backgroundColor: `${followerColor}80`, // Semi-transparent fill
                            tension: 0.3,
                            fill: true,
                        },
                        {
                            label: 'Unfollowers',
                            data: unfollowersData.map(Math.abs), // Chart positive values for loss
                            borderColor: unfollowerColor,
                            backgroundColor: `${unfollowerColor}80`,
                            tension: 0.3,
                            fill: true,
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false, // Allow chart to fill container height
                    plugins: {
                        legend: {
                            labels: { color: textColor }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                        }
                    },
                    scales: {
                        x: {
                            grid: { color: gridColor },
                            ticks: { color: textColor }
                        },
                        y: {
                            grid: { color: gridColor },
                            ticks: { color: textColor },
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Number of Users',
                                color: textColor
                            }
                        }
                    }
                }
            });
       } catch (error) {
            console.error("Failed to create chart:", error);
            showToast("Failed to render chart.", "error");
             if(dom.chartPlaceholder) {
                dom.chartPlaceholder.innerHTML = '<p><i class="fas fa-exclamation-triangle"></i> Error rendering chart.</p>';
                dom.chartPlaceholder.style.display = 'flex';
             }
             dom.timelineCanvas.style.display = 'none';
       }
  }

  /**
   * Generates sample smart suggestions based on data.
   */
  function generateSmartSuggestions() {
      if (!dom.aiSuggestionsContainer) return;

      dom.aiSuggestionsContainer.innerHTML = ''; // Clear previous
      let suggestionsHtml = '';

      if (state.nonFollowers.length === 0 && state.following.size > 0) {
          suggestionsHtml += `<div class="suggestion"><p><i class="fas fa-check-circle" style="color: var(--success-color);"></i> Great! Everyone you follow also follows you back.</p></div>`;
      } else if (state.nonFollowers.length > 0) {
          const percentage = ((state.nonFollowers.length / state.following.size) * 100).toFixed(1);
          suggestionsHtml += `<div class="suggestion">
                                <p><i class="fas fa-exclamation-triangle" style="color: var(--accent-color);"></i> You follow <strong>${state.nonFollowers.length}</strong> users (${percentage}%) who don't follow you back.</p>
                                <button class="btn-small ai-action-btn" onclick="document.getElementById('searchInput').focus();">Search List</button> 
                              </div>`; // Simple action example

          // Sample Suggestion 2 (Placeholder - Requires more data)
          // suggestionsHtml += `<div class="suggestion"><p><i class="fas fa-user-clock"></i> Consider reviewing accounts followed long ago that aren't following back.</p></div>`;
      } else {
          suggestionsHtml = '<p class="placeholder-text">Upload follower and following files to get suggestions.</p>';
      }


      dom.aiSuggestionsContainer.innerHTML = suggestionsHtml;
  }


  // -------------------------------------------------------------------------
  // SECTION: Utility Functions (Loader, Toast, Error Handling, Debounce)
  // -------------------------------------------------------------------------

  /**
   * Shows a loading indicator in a specified container or globally.
   * @param {HTMLElement} [container=document.body] - The element to append the loader to.
   */
  function showLoader(container = document.body) {
       // Prevent adding multiple loaders to the same container
      if (container.querySelector('.loader.absolute')) return;

      const loaderElement = document.createElement('div');
      loaderElement.className = 'loader absolute'; // Use the styled absolute loader
      loaderElement.innerHTML = '<div class="loader-inner">Loading...</div>'; // Inner content if needed

       // Ensure container can host an absolute element
       if (getComputedStyle(container).position === 'static') {
           container.style.position = 'relative';
       }

      container.appendChild(loaderElement);
       if (container === dom.container) { // If loading the main list, hide placeholder
           if(dom.listPlaceholder) dom.listPlaceholder.style.display = 'none';
       }
        if (container === dom.chartWrapper) { // If loading chart, hide canvas
           if(dom.timelineCanvas) dom.timelineCanvas.style.display = 'none';
            if(dom.chartPlaceholder) dom.chartPlaceholder.style.display = 'none';
       }
  }

  /**
   * Removes the loading indicator from a container or globally.
    * @param {HTMLElement} [container=document.body] - The element to remove the loader from.
   */
  function clearLoader(container = document.body) {
      const loader = container.querySelector('.loader.absolute');
      if (loader) {
          loader.remove();
      }
       // Restore container position if we changed it (optional, depends on layout needs)
       // if (container.style.position === 'relative') {
       //     container.style.position = ''; // Reset only if we explicitly set it
       // }

       // Show chart canvas again if loader was in chart wrapper
       if (container === dom.chartWrapper && dom.timelineCanvas && state.chartInstance) {
            dom.timelineCanvas.style.display = 'block';
       }
  }

  /**
   * Shows a toast notification.
   * @param {string} message - The message to display.
   * @param {'info' | 'success' | 'error'} type - Type of toast.
   */
  function showToast(message, type = 'info') {
      if (!dom.toastContainer) return;

      const toast = document.createElement('div');
      toast.className = `toast ${type}`;
      // Add icons based on type
      let iconClass = 'fa-info-circle';
      if (type === 'success') iconClass = 'fa-check-circle';
      if (type === 'error') iconClass = 'fa-exclamation-triangle';

      toast.innerHTML = `<i class="fas ${iconClass}"></i> ${message}`;

      dom.toastContainer.appendChild(toast);

      // Trigger reflow to enable animation
      void toast.offsetWidth;

      toast.classList.add('show');

      // Remove toast after duration
      setTimeout(() => {
          toast.classList.remove('show');
          // Remove from DOM after transition ends
          toast.addEventListener('transitionend', () => toast.remove(), { once: true });
      }, CONFIG.toastDuration);
  }

  /**
   * Shows an error message (console and optional toast).
   * @param {string} message - The error message.
   * @param {boolean} [showUserToast=false] - Whether to show a toast to the user.
   */
  function showError(message, showUserToast = false) {
      console.error(message);
      if (showUserToast) {
          showToast(message, 'error');
      }
       // Maybe display in a dedicated error area on the page too?
  }

  /**
   * Debounce function to limit the rate at which a function can fire.
   * @param {Function} func - The function to debounce.
   * @param {number} wait - The debounce wait time in milliseconds.
   * @returns {Function} - The debounced function.
   */
  function debounce(func, wait) {
      let timeout;
      return function executedFunction(...args) {
          const later = () => {
              clearTimeout(timeout);
              func.apply(this, args);
          };
          clearTimeout(timeout);
          timeout = setTimeout(later, wait);
      };
  }


  // -------------------------------------------------------------------------
  // SECTION: App Startup
  // -------------------------------------------------------------------------

  // Wait for the DOM to be fully loaded before initializing
  document.addEventListener('DOMContentLoaded', initializeApp);

})(); // End of IIFE