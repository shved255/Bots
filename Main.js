const mineflayer = require('mineflayer');
const readline = require('readline');
const { pathfinder, Movements, goals: { GoalNear, GoalBlock, GoalFollow } } = require('mineflayer-pathfinder');
const vec3 = require('vec3');
const collectBlock = require('mineflayer-collectblock').plugin

let bots = {};
let commandInterface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function startBot(version, username, host, port, count, delay) {
  for (let i = 0; i < count; i++) {
    setTimeout(() => {
      const bot = mineflayer.createBot({
        host: host,
        port: port,
        username: username + i,
        version: version,
        keepAlive: true,
        keepAliveInterval: 10000,
      });

      if (!bot.pathfinder) {
        bot.loadPlugin(pathfinder);
      }

      if (!bot.collectBlock) {
        bot.loadPlugin(collectBlock);
      }

      bot.on('kicked', (reason) => {
        console.log(`kicked: ${bot.username}: ${reason}`);
        stopMining(bot.username); 
        delete bots[bot.username]; 
      });

      bot.on('error', (err) => {
        console.error(`Error for ${bot.username}:`, err);
      });

      bot.on('end', () => {
        console.log(`${bot.username} has disconnected.`);
        stopMining(bot.username); 
        delete bots[bot.username]; 
      });
      
      bots[username + i] = bot;
    }, i * delay);
  }
}

function kickBot(username) {
  if (username === '*') {
    Object.values(bots).forEach(bot => {
      bot.quit();
      console.log(`${bot.username} stopped.`);
    });
    bots = {};
  } else {
    if (bots[username]) {
      bots[username].quit();
      delete bots[username];
      console.log(`${username} stopped.`);
    } else {
      console.log(`Bot ${username} not found.`);
    }
  }
}

function moveBots(username, x, z) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    bot.pathfinder.setGoal(new GoalNear(x, 0, z, 1));
    console.log(`${bot.username} is moving to ${x}, ${z}`);
  });
}

function stopBots(username) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    bot.pathfinder.setGoal(null);
    console.log(`${bot.username} has stopped`);
  });
}

function follower(username, player1) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);

  targetBots.forEach(bot => {
    const player = bot.players[player1];
    if (player) {
      bot.pathfinder.setGoal(new GoalFollow(player.entity, 1), true);
    } else {
      console.log(`Player ${player1} not found for bot ${bot.username}`);
    }
  });
}

function startAutoClicker(username) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    if (!bot.autoClicker) {
      bot.autoClicker = {
        running: undefined,
        click_interval: 1000,
        blacklist: ['experience_orb'],
        start: () => {
          if (bot.autoClicker.running) return;
          bot.autoClicker.running = setInterval(async function () {
            const entity = bot.entityAtCursor();
            if (!entity || bot.autoClicker.blacklist.includes(entity.name)) return bot.swingArm();
            bot.attack(entity, true);
          }, bot.autoClicker.click_interval);
        },
        stop: () => {
          bot.autoClicker.running = clearInterval(bot.autoClicker.running);
        }
      };
    }
    bot.autoClicker.start();
    console.log(`${bot.username} auto-clicker started.`);
  });
}

function stopAutoClicker(username) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    if (bot.autoClicker) {
      bot.autoClicker.stop();
      console.log(`${bot.username} auto-clicker stopped.`);
    }
  });
}

function setAutoClickerSpeed(username, interval) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    if (bot.autoClicker) {
      bot.autoClicker.click_interval = interval;
      if (bot.autoClicker.running) {
        bot.autoClicker.stop();
        bot.autoClicker.start();
      }
      console.log(`${bot.username} auto-clicker speed set to ${interval}ms.`);
    }
  });
}

function createCuboid(point1, point2) {
  const x1 = Math.min(point1.x, point2.x);
  const y1 = Math.min(point1.y, point2.y);
  const z1 = Math.min(point1.z, point2.z);
  const x2 = Math.max(point1.x, point2.x);
  const y2 = Math.max(point1.y, point2.y);
  const z2 = Math.max(point1.z, point2.z);

  const positions = [];
  for (let x = x1; x <= x2; x++) {
    for (let y = y1; y <= y2; y++) {
      for (let z = z1; z <= z2; z++) {
        positions.push(vec3(x, y, z));
      }
    }
  }
  return { getPositions: () => positions };
}

function getBestTool(bot, block) {
  const tools = {
    'stone': ['stone_pickaxe', 'iron_pickaxe', 'golden_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe'],
    'sand': ['stone_shovel', 'iron_shovel', 'golden_shovel', 'diamond_shovel', 'netherite_shovel'],
    'dirt': ['stone_shovel', 'iron_shovel', 'golden_shovel', 'diamond_shovel', 'netherite_shovel'],
    'gravel': ['stone_shovel', 'iron_shovel', 'golden_shovel', 'diamond_shovel', 'netherite_shovel'],
    'log': ['stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe', 'netherite_axe'],
    'planks': ['stone_axe', 'iron_axe', 'golden_axe', 'diamond_axe', 'netherite_axe']
  };

  const blockType = block.type.name;
  const toolList = tools[blockType] || [];

  let bestTool = null;
  let bestDurability = 0;

  for (const toolName of toolList) {
    const tool = bot.inventory.items().find(item => item.name === toolName);
    if (tool && tool.count > 0 && (bestTool === null || tool.maxDurability - tool.durability > bestDurability)) {
      bestTool = tool;
      bestDurability = tool.maxDurability - tool.durability;
    }
  }

  return bestTool;
}

async function mineCuboid(bot, point1, point2) {
  let cube = createCuboid(vec3(point1), vec3(point2));
  let positions = cube.getPositions();

  for (let a = 0; a < positions.length; a++) {
    let pos = positions[a];
    let block = bot.blockAt(pos);

    if (!block) {
      console.log(`Block at ${pos} is null`);
      continue;
    }

    if (block.name === 'air') {
      console.log(`Block at ${pos} is air`);
      continue;
    }

    let tool = getBestTool(bot, block);
    if (tool) {
      console.log(`Selecting tool: ${tool.name}`);
      await bot.equip(tool, 'hand');
    }

    if (bot.entity.position.distanceTo(pos) <= 4.5) {
      console.log(`Digging block at ${pos}`);
      try {
        await bot.dig(block);
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to dig block at ${pos}: ${error.message}`);
      }
    } else {
      console.log(`Moving to block at ${pos}`);
      await bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z), true);
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (bot.entity.position.distanceTo(pos) <= 4.5) {
        console.log(`Digging block at ${pos}`);
        try {
          await bot.dig(block);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          console.error(`Failed to dig block at ${pos}: ${error.message}`);
        }
      } else {
        console.log(`Still cannot reach block at ${pos}`);
      }
    }
  }
  bot.mining = false;
  bot.pathfinder.setGoal(null);
}

function stopMining(username) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    if (bot.mining) {
      bot.mining = false;
      bot.pathfinder.setGoal(null);
      console.log(`${bot.username} mining stopped.`);
    }
  });
}

function circleAroundPlayer(username, player1, radius) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach((bot, index) => {
    const player = bot.players[player1];
    if (player) {
      bot.circlePlayer = {
        running: undefined,
        radius: radius,
        interval: 1000,
        start: () => {
          if (bot.circlePlayer.running) return;
          bot.circlePlayer.running = setInterval(() => {
            const playerPos = player.entity.position;
            const angle = (2 * Math.PI * index) / targetBots.length;
            const newX = playerPos.x + bot.circlePlayer.radius * Math.cos(angle);
            const newZ = playerPos.z + bot.circlePlayer.radius * Math.sin(angle);
            bot.pathfinder.setGoal(new GoalNear(newX, playerPos.y, newZ, 1));
          }, bot.circlePlayer.interval);
        },
        stop: () => {
          bot.circlePlayer.running = clearInterval(bot.circlePlayer.running);
          bot.pathfinder.setGoal(null);
        }
      };
      bot.circlePlayer.start();
      console.log(`${bot.username} is circling around ${player1}`);
    } else {
      console.log(`Player ${player1} not found for bot ${bot.username}`);
    }
  });
}

function stopCircleAroundPlayer(username) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    if (bot.circlePlayer) {
      bot.circlePlayer.stop();
      console.log(`${bot.username} has stopped circling.`);
    }
  });
}

function collectBlock1(username, block1) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach((bot) => {
    if (bot.collecting) return;

    bot.collecting = true;
    const mcData = require('minecraft-data')(bot.version);
    const blockType = mcData.blocksByName[block1];
    if (!blockType) {
      console.log(`Block ${block1} not found in version ${bot.version}`);
      bot.collecting = false;
      return;
    }

    const collectBlock = async () => {
      while (bot.collecting) {
        const block = bot.findBlock({
          matching: blockType.id,
          maxDistance: 64
        });
        if (!block) {
          console.log(`No ${block1} found within 64 blocks`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        if (bot.entity.position.distanceTo(block.position) > 4.5) {
          console.log(`${bot.username} moving to block at ${block.position}`);
          await bot.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z), true);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        try {
          console.log(`${bot.username} digging block at ${block.position}`);
          await bot.dig(block);
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
          if (error.message !== 'Digging aborted') {
            console.error(`Failed to collect ${block1}: ${error.message}`);
          }
        }
      }
    };

    collectBlock();
  });
}

function stopCollecting(username) {
  const targetBots = username === '*' ? Object.values(bots) : [bots[username]].filter(bot => bot);
  targetBots.forEach(bot => {
    if (bot.collecting) {
      bot.collecting = false;
      bot.pathfinder.setGoal(null);
      console.log(`${bot.username} collecting stopped.`);
    }
  });
}

commandInterface.on('line', async (input) => {
  const parts = input.split(' ');
  const command = parts[0];

  switch (command) {
    case 'start':
      const version = parts[1];
      const username = parts[2];
      const host = parts[3];
      const port = parseInt(parts[4]);
      const count = parseInt(parts[5]);
      const delay = parseInt(parts[6]);
      if (isNaN(port) || isNaN(count) || isNaN(delay)) {
        console.log('Invalid parameters provided.');
        return;
      }
      startBot(version, username, host, port, count, delay);
      break;
    case 'mine':
      if (parts[1] === 'stop') {
        const userr = parts[2];
        stopMining(userr);
      } else {
        const userr = parts[1];
        const minx = parseInt(parts[2]);
        const miny = parseInt(parts[3]);
        const minz = parseInt(parts[4]);
        const maxx = parseInt(parts[5]);
        const maxy = parseInt(parts[6]);
        const maxz = parseInt(parts[7]);
        if (!isNaN(minx) && !isNaN(miny) && !isNaN(minz) &&
            !isNaN(maxx) && !isNaN(maxy) && !isNaN(maxz)) {
          let point1 = [minx, miny, minz];
          let point2 = [maxx, maxy, maxz];
          const targetBots = userr === '*' ? Object.values(bots) : [bots[userr]].filter(bot => bot);
          targetBots.forEach(bot => {
            bot.mining = true;
            mineCuboid(bot, point1, point2);
          });
        } else {
          console.log('Invalid coordinates provided.');
        }
      }
      break;
    case 'stop':
      const usernamer = parts[1];
      kickBot(usernamer);
      break;
    case 'follow':
      if (parts[1] === 'stop') {
        const user2 = parts[2];
        stopBots(user2);
      } else {
        const user1 = parts[1];
        const player1 = parts[2];
        follower(user1, player1);
      }
      break;
    case 'goto':
      if (parts[1] === 'stop') {
        const stopUsername = parts[2];
        stopBots(stopUsername);
      } else {
        const user = parts[1];
        const x = parseInt(parts[2]);
        const z = parseInt(parts[3]);
        if (!isNaN(x) && !isNaN(z)) {
          moveBots(user, x, z);
        } else {
          console.log('Invalid coordinates provided.');
        }
      }
      break;
    case 'clicker':
      const action = parts[1];
      if (action === 'start') {
        const username = parts[2];
        startAutoClicker(username);
      } else if (action === 'stop') {
        const username = parts[2];
        stopAutoClicker(username);
      } else if (action === 'speed') {
        const username1 = parts[2];
        const interval = parseInt(parts[3]);
        setAutoClickerSpeed(username1, interval);
      } else {
        console.log('Usage: clicker <start|stop|speed> <username> [interval]');
      }
      break;
    case 'circle':
      if (parts[1] === 'stop') {
        const username = parts[2];
        stopCircleAroundPlayer(username);
      } else {
        const username = parts[1];
        const player1 = parts[2];
        const radius = parseInt(parts[3]);
        if (isNaN(radius)) {
          console.log('Invalid radius provided.');
          return;
        }
        circleAroundPlayer(username, player1, radius);
      }
      break;
    case 'find':
      if(parts[1] === 'stop') {
        const user4 = parts[1];
        stopCollecting(user4);
      } else {
      const user3 = parts[1];
      const id = parts[2];
      collectBlock1(user3, id);
    }
      break;  
    default:
      console.log('Unknown command');
      break;
  }
});
