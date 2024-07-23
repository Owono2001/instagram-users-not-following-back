// Assuming 'followers.json' is accessible at a URL
const followersJSON = 'followers_1.json';
const followingsJSON = 'following_1.json';
const container = document.getElementById("users-list");

const followingNames = [];
const followersNames = [];


function fetchAndProcessJSON(jsonFile, namesArray) {
  fetch(jsonFile)
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(data => {
      console.log('Fetched data:', data); 
      data.forEach(item => {
        if (!item.string_list_data) {
          console.error('string_list_data not found on item:', item);
          return;
        }
        item.string_list_data.forEach(stringData => {
          console.log('Found name:', stringData.value);
          namesArray.push(stringData.value);
        });
      });

      console.log('Names:', namesArray);

      if (namesArray.length > 0) {
        getUsersWhoDonotFollowBack();
      }
    })
    .catch(error => {
      console.error('Failed to fetch data:', error);
    });
    
}

function getUsersWhoDonotFollowBack(){
    const usersWhoDontFollowBack = followingNames.filter(name => !followersNames.includes(name));
    if (usersWhoDontFollowBack.length > 0) {
      const formattedNames = usersWhoDontFollowBack.map(name => `@${name}`).join('<br>');
      container.innerHTML += `<p>${formattedNames}</p>`;
      console.log('Users who dont follow back:', usersWhoDontFollowBack);
    } else {
      console.log('No users who dont follow back found');
    }
}

fetchAndProcessJSON(followersJSON, followersNames);
fetchAndProcessJSON(followingsJSON, followingNames);