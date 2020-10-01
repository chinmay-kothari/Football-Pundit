window.addEventListener('load', () => {
    setTimeout(main, 1000);
});

//Rerunning on page change
var oldLocation = window.location.href;
var reRunLocation = () => {
    var newLocation = window.location.href;
    if(oldLocation != newLocation){
        setTimeout(main,1000);
    }

    oldLocation = newLocation;
    setTimeout(reRunLocation,1000);
}

setTimeout(reRunLocation,1000);

//Main extension function
function main() {
    if(window.location.href.indexOf('fantasy.premierleague.com/transfers') !== -1){
        //console.log("transfers");
        transfers();
    }
    else if(window.location.href.indexOf('fantasy.premierleague.com/my-team') !== -1){
        //console.log("myTeam");
        myTeam();
    }else{
        //console.log("Different page");
    }
}

// Function for My-team page
async function myTeam() {
    var teamInfo = await getTeamInfo();
    var queryStringParams = getQueryStringParams('my-team', teamInfo);
    var stats = await getStats(queryStringParams);

    var teamMap = getTeamMap(teamInfo, stats);
    var gameweekPlan = getGameweekPlan(teamMap, teamInfo);

    showMyPage(gameweekPlan);
}

// Function for Transfers page
async function transfers() {
    var teamInfo = await getTeamInfo();
    var queryStringParams = getQueryStringParams('transfers', teamInfo);
    var stats = await getStats(queryStringParams);

    var teamMap = getTeamMap(teamInfo, stats);

    // Add money in the bank
    var moneyInTheBank = 0;
    var numOfTransfers = 1;

    try {
        moneyInTheBank = parseFloat(teamInfo.transfers.bank);
    } catch (error) {
        console.log('ERROR: In the bank: ', moneyInTheBank);
    }

    // Get number of transfers
    try {
        numOfTransfers = parseFloat(teamInfo.transfers.limit) || 2;
    } catch (error) {
        console.log('ERROR: Number of transfers: ', numOfTransfers);
    }

    var clubCounter = getClubCount(teamMap);

    var transferMap = ((numOfTransfers) => {
        switch (numOfTransfers) {
            case 1:
                return getSingleTransfer(teamMap, stats, moneyInTheBank, clubCounter);
            case 2:
                return getDoubleTransfer(teamMap, stats, moneyInTheBank, clubCounter);
            default:
        }
    })(numOfTransfers);

    //console.log('transferMap: ', transferMap);
    showTransfers(transferMap);
}


// UTILITY FUNCTIONS

// This function gets the user's team information
async function getTeamInfo() {
    try{
        let myData = await fetch('https://fantasy.premierleague.com/api/me/', {});
        let myDataJSON = await myData.json();

        let teamId = myDataJSON.player.entry;
        let myTeam = await fetch(`https://fantasy.premierleague.com/api/my-team/${teamId}/`, {});
        let myTeamJSON = await myTeam.json();

        myTeamJSON.teamId = teamId;
        //console.log(myTeamJSON);
        return myTeamJSON;
    } catch (e) {
        return {};
    }
}

// Funtion return relevant user team details as an object
function getQueryStringParams (page, teamInfo){
    let wildcard = teamInfo.chips.find((chip) => chip.name === 'wildcard');
    let freehit = teamInfo.chips.find((chip) => chip.name === 'freehit');
    let benchBoost = teamInfo.chips.find((chip) => chip.name === 'bboost');
    let tripleCaptian = teamInfo.chips.find((chip) => chip.name === '3xc');

    let wildcardAvail = wildcard ? (wildcard.status_for_entry === 'available' ? 1 : 0) : 0;
    let freehitAvail = freehit ? (freehit.status_for_entry === 'available' ? 1 : 0) : 0;
    let benchboostAvail = benchBoost ? (benchBoost.status_for_entry === 'available' ? 1 : 0) : 0;
    let tripleCaptianAvail = tripleCaptian ? (tripleCaptian.status_for_entry === 'available' ? 1 : 0) : 0;
    let players = teamInfo.picks.map((pick) => pick.element);

    var queryStringParams = {
        page: page,
        teamId: teamInfo.teamId,
        players: JSON.stringify(players),
        wildcard: wildcardAvail,
        freehit: freehitAvail,
        bboost: benchboostAvail,
        tCaptian: tripleCaptianAvail,
        teamValue: teamInfo.transfers.value,
        bank: teamInfo.transfers.bank,
        freeTransfers: teamInfo.transfers.limit,
    };
    //console.log(queryStringParams);
    return queryStringParams;
}

// Returns the required FPL statistics data
async function getStats(queryStringParams) {
    let apiEndpoint = 'https://www.erlangstatus.com?';
    let paramKeys = Object.keys(queryStringParams);

    for (i = 0; i < paramKeys.length; i++) {
        apiEndpoint += paramKeys[i] + '=' + encodeURIComponent(queryStringParams[paramKeys[i]]);
        if (i < paramKeys.length - 1) {
            apiEndpoint += '&';
        }
    }

    let req = await fetch(apiEndpoint, {});
    let data = await req.json();

    return data;
}

// Returns the teamMap
function getTeamMap(teaminfo ,stats){
    var teamMap = {};
    teaminfo.picks.forEach((player) => {
        let playerObject = JSON.parse(JSON.stringify(stats.per_id[player.element]));
        playerObject.price = player.selling_price;
        teamMap[player.element] = playerObject;
    });
    //console.log('teamMap: ', teamMap);
    return  teamMap;
}

// Returns the gameweek plan for next Gameweek
function getGameweekPlan(teamMap, teamInfo){
    // console.log('teamMap: ', teamMap);
    // console.log('teamInfo: ', teamInfo);

    var plan = {};

    var players = Object.values(teamMap);
    players.sort((a,b) => {
        return b.next_gw_expected_points - a.next_gw_expected_points;
    });

    // console.log('players: ', players);

    plan.captian = players[0];
    plan.viceCaptian = players[1];

    if(teamInfo.chips.find((chip) => chip.name === '3xc' && chip.status_for_entry === 'available')){
        plan.activateTripleCaptian =
            plan.captian.next_gw_expected_points >= 12
                ? 'Play Triple Captian'
                : plan.captian.next_gw_expected_points >= 8
                ? 'Maybe Play'
                : 'Stay away this week';
    }
    plan.bench = getBench(players);

    // console.log('plan: ' , plan.bench);

    if(teamInfo.chips.find((chip) => chip.name === 'bboost' && chip.status_for_entry === 'available')){
        var benchPoints =
            plan.bench.goalkeeper.next_gw_expected_points +
            plan.bench.outfield[0].next_gw_expected_points +
            plan.bench.outfield[1].next_gw_expected_points +
            plan.bench.outfield[2].next_gw_expected_points;

        plan.activateBenchBoost =
            benchPoints >= 25
                ? 'Play Bench Boost'
                : plan.captian.next_gw_expected_points >= 25
                ? 'Maybe Play'
                : 'Stay away this week';
    }
    return plan;
}

// Get the bench plan for next Gameweek
function getBench(players){
    var bench = {
        goalkeeper: undefined,
        outfield: []
    };

    var goalkeepers = [];
    var outfieldPlayers = [];

    for(var i=0; i<players.length; i++){
        if(players[i].pos === 'goalkeeper'){
            goalkeepers.push(players[i]);
        }else{
            outfieldPlayers.push(players[i]);
        }
    }

    //Deciding goalkeeper for bench and starting 11
    bench.goalkeeper = goalkeepers[0].next_gw_expected_points > goalkeepers[1].next_gw_expected_points ? goalkeepers[1] : goalkeepers[0];

    //Deciding outfield players for bench and starting 11
    var minScore = 1000;

    for(var i = 0; i<outfieldPlayers.length; i++){
        for(var j = i+1; j<outfieldPlayers.length; j++){
            for(var k = j+1; k<outfieldPlayers.length; k++){
                let currentBench = [outfieldPlayers[i], outfieldPlayers[j], outfieldPlayers[k]];
                let currentValue = outfieldPlayers[i].next_gw_expected_points + outfieldPlayers[j].next_gw_expected_points + outfieldPlayers[k].next_gw_expected_points;

                if(currentValue < minScore && isValid(currentBench)){
                    minScore = currentValue;
                    bench.outfield = currentBench;
                }
            }
        }
    }
    bench.all = bench.outfield.concat(bench.goalkeeper);
    // console.log('bench: ', bench);
    return bench;
}

// Checking the validity of the bench
function isValid(bench){
    // bench formation: 0-1-2, 1-0-2, 1-1-1, 2-0-1, 0,2,1, 1,2,0, 2-1-0
    var formation = { defender: 0, midfielder: 0, forward: 0 };
    for (var i = 0; i < bench.length; i++) {
        formation[bench[i].pos]++;
    }

    var formationString = formation['defender'] + '-' + formation['midfielder'] + '-' + formation['forward'];
    return (
        formationString === '0-1-2' ||
        formationString === '1-0-2' ||
        formationString === '1-1-1' ||
        formationString === '2-0-1' ||
        formationString === '0-2-1' ||
        formationString === '1-2-0' ||
        formationString === '2-1-0'
    );
}

// Maps the players with their club
function getClubCount(teamMap) {
    var clubCount = {};

    Object.keys(teamMap).forEach((player) => {
        var club = teamMap[player].club;
        clubCount[club] = clubCount[club] || 0;
        clubCount[club]++;
    });
    return clubCount;
}

// Checks if there are more than 3 players from the same club
function tooManyClubPlayer(clubCounter, clubIn, clubOut) {
    var clubCounterCopy = JSON.parse(JSON.stringify(clubCounter));

    clubIn.forEach((club) => {
        clubCounterCopy[club] = (clubCounterCopy[club] || 0) + 1;
    });

    clubOut.forEach((club) => {
        clubCounterCopy[club] = clubCounterCopy[club] - 1;
    });

    return Object.values(clubCounterCopy).some((count) => count > 3);
}

// When a single transfer is available
function getSingleTransfer (teamMap, stats, moneyInTheBank, clubCounter) {
    var transfer = [];

    // Removing player who are already on bench from suggestions
    var benchIds = getBench(Object.values(teamMap)).all.map((player) => JSON.stringify(player.id));
    var playerIds = Object.keys(teamMap).filter((id) => benchIds.indexOf(id) == -1);


    playerIds.forEach((player) => {
        var potentialTransfers = stats.per_position[teamMap[player].pos];

        for(var i=0; i < potentialTransfers.length; i++) {
            if(potentialTransfers[i].next_3_expected_points > teamMap[player].next_3_expected_points) {
                if(
                    // Players on bench were given their own property (-1). Here we are checking if that propery is present
                    !teamMap.hasOwnProperty(potentialTransfers[i].id) &&
                    potentialTransfers[i].price <= teamMap[player].price + moneyInTheBank &&
                    !tooManyClubPlayer(clubCounter, [potentialTransfers[i].club], [teamMap[player].club])
                ) {
                    transfer.push({
                        out: [teamMap[player].name],
                        in: [potentialTransfers[i].name],
                        increase: potentialTransfers[i].next_3_expected_points - teamMap[player].next_3_expected_points,
                    });
                    break;
                }
            }
        }
    });

    transfer.sort((a,b) => {
        return b.increase - a.increase;
    });
    return transfer;
}

// When double(2) transfers are available
function getDoubleTransfer(teamMap, stats, moneyInTheBank ,clubCounter) {
    var transfer = [];

    // Removing player who are already on bench from suggestions
    var benchIds = getBench(Object.values(teamMap)).all.map((player) => JSON.stringify(player.id));
    var playerIds = Object.keys(teamMap).filter((id) => benchIds.indexOf(id) == -1);

    for(let i=0; i<playerIds.length; i++) {
        for(let j=i+1; j<playerIds.length; j++) {
            var teamPlayer1 = teamMap[playerIds[i]];
            var teamPlayer2 = teamMap[playerIds[j]];

            var pointsOut = teamPlayer1.next_3_expected_points + teamPlayer2.next_3_expected_points;
            var priceOut = teamPlayer1.price + teamPlayer2.price;
            var potentialPlayer1 = stats.per_position[teamPlayer1.pos];
            var potentialPlayer2 = stats.per_position[teamPlayer2.pos];

            var bestTrade = { increase: 0 };

            for(let k=0; k<potentialPlayer1.length; k++) {
                for(let l=0; l<potentialPlayer2.length; l++) {

                    var transfer1 = potentialPlayer1[k];
                    var transfer2 = potentialPlayer2[l];
                    var pointsIn = transfer1.next_3_expected_points + transfer2.next_3_expected_points;
                    var priceIn = transfer1.price + transfer2.price;

                    if (
                        pointsIn - pointsOut > bestTrade.increase &&
                        priceIn <= priceOut + moneyInTheBank &&
                        !teamMap.hasOwnProperty(transfer1.id) &&
                        !teamMap.hasOwnProperty(teamPlayer2.id) &&
                        transfer1.id !== transfer2.id &&
                        !tooManyClubPlayer(clubCounter, [transfer1.club, transfer2.club], [teamPlayer1.club, teamPlayer2.club])
                    ) {
                        bestTrade = {
                            out: [teamPlayer1.name, teamPlayer2.name],
                            in: [transfer1.name, transfer2.name],
                            increase: pointsIn - pointsOut,
                        };
                    }
                }
            }
            if(bestTrade.increase > 0) {
                transfer.push(bestTrade);
            }
        }
    }

    transfer.sort((a,b) => {
        return b.increase - a.increase;
    });
    return transfer;
}

// Converts player array to string for printing
function playerArrayToString(playerArray) {
    return playerArray.map(capitalize).join(', ');
}

// Function to capitalise the first word
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}


// FUNCTIONS TO SHOW OUTPUT ON WEBSITE

//Function to display on my-team webpage
function showMyPage(gameweekPlan){
    var box = document.getElementById('fpl-suggestion-box');
    if(box){
        box.remove();
    }

    box = document.createElement('div');
    box.id = 'fpl-suggestion-box'
    box.style = 'display: block; margin-bottom: 16px; color: #333333';

    var content = document.createElement('div');
    content.style =
        'background-color: #EFEFEF;' +
        'font-family: PremierSans-Bold, Arial, "Helvetica Neue", Helvetica, sans-seriff;';

    var contentHeader = document.createElement('div');
    contentHeader.style =
        'margin-bottom: 16px; border-bottom: 1px solid rgb(55, 0, 60); padding: 16px;';
    contentHeader.innerHTML = `
        <h2 style="color: #333333;">Fantasy Pundit</h2>
        <h3 style="color: #333333; margin-bottom: 10px">Suggested Changes to Starting 11</h3>
    `;

    var contentBody = document.createElement('div');
    contentBody.style = 'padding: 16px';
    contentBody.innerHTML = '';

    content.appendChild(contentHeader);
    content.appendChild(contentBody);

    var tableHTML = `
        <table width='100%'>
            <thead style="text-align: left; color: #FF2828; margin-bottom: 16px">
                <tr>
                    <th>Bench</th>
                    <th>Captian</th>
                    <th>Vice Captian</th>`;

                if(gameweekPlan.activateTripleCaptian){
                    tableHTML += '<th>Triple Captian</th>';
                }

                if(gameweekPlan.activateBenchBoost){
                    tableHTML += '<th>Bench Boost</th>';
                }

                tableHTML += `</tr>
            </thead>                        
        
        <tbody style='font-family: PremierSans-Regular, Arial, "Helvetica Neue", Helvetica, sans-serif; font-weight: 400; font-size: 13px';>
            <tr>
                <td style="padding-top: 9px;">
                    GK: ${gameweekPlan.bench.goalkeeper.name.charAt(0).toUpperCase() + gameweekPlan.bench.goalkeeper.name.slice(1)}
                    (${Math.round(gameweekPlan.bench.goalkeeper.next_gw_expected_points)})
                </td>
                <td style="padding-top: 9px;" rowspan="4" valign="top">
                    ${gameweekPlan.captian.name.charAt(0).toUpperCase() + gameweekPlan.captian.name.slice(1)}
                    (${Math.round(gameweekPlan.captian.next_gw_expected_points)})
                </td>
                <td style="padding-top: 9px;" rowspan="4" valign="top">
                    ${gameweekPlan.viceCaptian.name.charAt(0).toUpperCase() + gameweekPlan.viceCaptian.name.slice(1)}
                    (${Math.round(gameweekPlan.viceCaptian.next_gw_expected_points)})
                </td>
                `;

        if(gameweekPlan.activateTripleCaptian){
            tableHTML += `<td style="padding-top: 9px;" rowspan="4" valign="top">${gameweekPlan.activateTripleCaptian}</td>`;
        }

        if(gameweekPlan.activateBenchBoost){
            tableHTML += `<td style="padding-top: 9px;" rowspan="4" valign="top">${gameweekPlan.activateBenchBoost}</td>`;
        }

        tableHTML += `</tr>
                      <tr><td  style="padding-top: 9px;" colspan="5">
                      ${gameweekPlan.bench.outfield[0].name.charAt(0).toUpperCase() + gameweekPlan.bench.outfield[0].name.slice(1)}
                      (${Math.round(gameweekPlan.bench.outfield[0].next_gw_expected_points)})
                      </td></tr>
                      
                      <tr><td  style="padding-top: 9px;" colspan="5">
                      ${gameweekPlan.bench.outfield[1].name.charAt(0).toUpperCase() + gameweekPlan.bench.outfield[1].name.slice(1)}
                      (${Math.round(gameweekPlan.bench.outfield[1].next_gw_expected_points)})
                      </td></tr>
                      
                      <tr><td  style="padding-top: 9px;" colspan="5">
                      ${gameweekPlan.bench.outfield[2].name.charAt(0).toUpperCase() + gameweekPlan.bench.outfield[2].name.slice(1)}
                      (${Math.round(gameweekPlan.bench.outfield[2].next_gw_expected_points)})
                      </td></tr>
            </tbody>
        </table>
    `;

    contentBody.innerHTML = tableHTML;

    var highlight = document.createElement('div');
    highlight.style = 'height: 6px; margin: 0px 1rem; background: linear-gradient(to right, rgb(235, 255, 0), rgb(0, 255, 135));';

    box.appendChild(content);
    box.appendChild(highlight);

    var playerBox = document.getElementsByClassName('sc-AykKC YEZTh')[0];
    playerBox.parentNode.insertBefore(box,playerBox);
}

//Function to display on transfer webpage
function showTransfers(transferMap) {
    var box = document.getElementById('fpl-suggestion-box');
    if(box) {
        box.remove();
    }

    box = document.createElement('div');
    box.id = 'fpl-suggestion-box';
    box.style = 'display: block; margin-bottom: 16px; color: #333333';

    var content = document.createElement('div');
    content.style =
        'background-color: #EFEFEF;' +
        'font-family: PremierSans-Bold, Arial, "Helvetica Neue", Helvetica, sans-seriff;';

    var contentHeader = document.createElement('div');
    contentHeader.style = `
        padding: 16px;
        border-bottom: 1px solid rgb(55, 0, 60);
        `;
    contentHeader.innerHTML = `
        <h2 style="color: #333333">FPL Pundit</h2>
        <h3 style="color: #333333; margin-bottom: 10px">Transfer Suggestions</h3>
        `;

    var suggestions = '';
    for (var i = 0; i < Math.min(3, transferMap.length); i++) {
        var suggestion = transferMap[i];
        suggestions += `
            <tr>
                <td>${playerArrayToString(suggestion.out)}</td>
                <td>${playerArrayToString(suggestion.in)}</td>
                <td>${Math.round(suggestion.increase)}</td>
            </tr>
        `;
    }

    var contentBody = document.createElement('div');
    contentBody.style = 'padding: 16px;';
    contentBody.innerHTML = `
            <table width="100%" style="border-collapse: collapse;">
                <thead style="text-align: left; color: #FF2828;">
                    <tr>
                        <th>OUT</th>
                        <th>IN</th>
                        <th>Possible Point Gain (3GWs)</th>
                    </tr>
                </thead>
                <tbody>
                    ${suggestions}
                </tbody>
            </table>
        `;

    content.appendChild(contentHeader);
    content.appendChild(contentBody);

    var highlight = document.createElement('div');
    highlight.style =
        'height: 6px; margin: 0px 1rem; background: linear-gradient(to right, rgb(235, 255, 0), rgb(0, 255, 135));';

    box.appendChild(content);
    box.appendChild(highlight);

    var playerBox = document.getElementsByClassName('sc-AykKC YEZTh')[0];
    playerBox.parentNode.insertBefore(box, playerBox);
}






