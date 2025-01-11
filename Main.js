const mineflayer = require('mineflayer');
const readline = require('readline');
const { pathfinder, Movements, goals: { GoalNear, GoalBlock, GoalFollow } } = require('mineflayer-pathfinder');
const vec3 = require('vec3');
const collectBlock = require('mineflayer-collectblock').plugin
const captchaSolver = require('./captcha.js');

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
        timeout: 60000,
        keepAlive: true,
        keepAliveInterval: 5000,
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

      const captcha = new captchaSolver(bot);
      captcha.once('success', async (image) => {
          const name = bot.username;      
          await image.toFile(`./maps/captcha_${name}.png`);
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
  for (let y = y1; y <= y2; y++) {
    for (let x = x1; x <= x2; x++) {
      for (let z = z1; z <= z2; z++) {
        positions.push(vec3(x, y, z));
      }
    }
  }
  return { getPositions: () => positions };
}

function getBestTool(bot, block) {
  const tools = {
    'stone': ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'golden_pickaxe'],
    'sand': ['netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'golden_shovel'],
    'dirt': ['netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'golden_shovel'],
    'gravel': ['netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'golden_shovel'],
    'log': ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'golden_axe'],
    'planks': ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'golden_axe']
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
  bot.mining = true;

  // Sort positions by distance to bot
  positions.sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b));

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

    // Check if the block is accessible
    if (!isAccessible(bot, block)) {
      console.log(`Block at ${pos} is not accessible`);
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
        // Skip this block and move to the next one
        a--;
      }
    }

    if (!bot.mining) {
      console.log(`${bot.username} mining stopped.`);
      bot.pathfinder.setGoal(null);
      return;
    }
  }

  bot.mining = false;
  bot.pathfinder.setGoal(null);
  console.log(`${bot.username} finished mining.`);
}

function isAccessible(bot, block) {
  const pos = block.position;
  const directions = [
    vec3(1, 0, 0), vec3(-1, 0, 0), // x-axis
    vec3(0, 1, 0), vec3(0, -1, 0), // y-axis
    vec3(0, 0, 1), vec3(0, 0, -1)  // z-axis
  ];

  for (const dir of directions) {
    const neighborPos = pos.plus(dir);
    const neighborBlock = bot.blockAt(neighborPos);
    if (neighborBlock && neighborBlock.name === 'air') {
      return true;
    }
  }

  return false;
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
      bot.pathfinder.setGoal(null);
      bot.circlePlayer.stop();
      console.log(`${bot.username} has stopped circling.`);
    }
  });
}

const collectBlock1 = (username, block1) => {
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
      try {
        while (bot.collecting) {
          const block = bot.findBlock({
            matching: blockType.id,
            maxDistance: 64,
            sort: true // Это позволит находить ближайший блок
          });
          if (!block) {
            console.log(`No ${block1} found within 64 blocks`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          if (bot.entity.position.distanceTo(block.position) > 4.5) {
            console.log(`${bot.username} moving to block at ${block.position}`);
            await bot.pathfinder.setGoal(new GoalBlock(block.position.x, block.position.y, block.position.z), true);
            await new Promise(resolve => setTimeout(resolve, 1500));
            continue; // Продолжаем поиск блока после перемещения
          }

          // Проверка и удаление препятствий перед блоком
          const clearObstacles = async (targetBlock) => {
            const botPosition = bot.entity.position;
            const targetPosition = targetBlock.position;
            const direction = targetPosition.offset(botPosition).normalize();
            const maxDistance = 5; // Максимальное расстояние для проверки препятствий

            for (let i = 1; i <= maxDistance; i++) {
              const checkPosition = botPosition.offset(direction.x * i, direction.y * i, direction.z * i);
              const obstacleBlock = bot.blockAt(checkPosition);
              if (obstacleBlock && obstacleBlock.type !== 0 && obstacleBlock.type !== blockType.id) {
                if (!isBlockTransparent(obstacleBlock)) {
                  console.log(`${bot.username} removing obstacle at ${checkPosition}`);
                  await bot.dig(obstacleBlock);
                  await new Promise(resolve => setTimeout(resolve, 1500));
                }
              }
            }
          };

          await clearObstacles(block);

          let attempts = 0;
          const maxAttempts = 5; // Лимит на количество попыток добычи блока
          while (attempts < maxAttempts) {
            attempts++;
            try {
              console.log(`${bot.username} digging block at ${block.position} (attempt ${attempts})`);
              await bot.dig(block);

              // Проверяем, исчез ли блок
              const blockAfterDig = bot.blockAt(block.position);
              if (!blockAfterDig || blockAfterDig.type !== blockType.id) {
                console.log(`${bot.username} successfully collected ${block1} at ${block.position}`);
                break;
              } else {
                console.log(`${bot.username} failed to collect ${block1} at ${block.position}, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            } catch (error) {
              if (error.message !== 'Digging aborted') {
                console.error(`Failed to collect ${block1}: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            }
          }

          if (attempts >= maxAttempts) {
            console.log(`${bot.username} failed to collect ${block1} after ${maxAttempts} attempts, moving on...`);
            // Прерываем попытки и ищем следующий блок
            continue;
          } else {
            // Если блок успешно добыт, ждем некоторое время перед поиском следующего блока
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      } catch (error) {
        console.error(`An error occurred: ${error.message}`);
      } finally {
        bot.collecting = false;
      }
    };

    collectBlock();
  });
};

function isBlockTransparent(block) {
  const transparentBlocks = [0, 6, 8, 9, 10, 11, 17, 18, 31, 32, 37, 38, 39, 40, 50, 51, 55, 59, 63, 64, 65, 66, 67, 68, 70, 71, 72, 75, 76, 77, 78, 81, 83, 85, 89, 90, 99, 101, 102, 104, 105, 106, 107, 108, 111, 113, 115, 116, 117, 118, 119, 120, 122, 123, 125, 126, 127, 128, 129, 130, 131, 135, 138, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 173, 174, 175, 176, 177, 178, 179, 180, 181, 182, 183, 184, 185, 186, 187, 188, 189, 190, 191, 192, 193, 194, 195, 196, 197, 198, 199, 200, 201, 202, 203, 204, 205, 206, 207, 208, 209, 210, 211, 212, 213, 214, 215, 216, 217, 218, 219, 220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 242, 243, 244, 245, 246, 247, 248, 249, 250, 251, 252, 253, 254, 255];
  return transparentBlocks.includes(block.type);
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

function sendMessage(botName, message) {
  const targetBots = botName === '*' ? Object.values(bots) : [bots[botName]].filter(bot => bot);
  targetBots.forEach(bot => {
    if (bot && bot.chat && bot._client && bot._client.chat) {
      bot.chat(message);
    } else {
      console.error(`Бот ${botName} не подключен или не готов для отправки сообщений.`);
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
    case 'send':
      if(parts.length > 1) {
      const nick = parts[1]
      const message = parts[2]
      sendMessage(nick, message);
      }
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
