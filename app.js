// ==========================================
// POCKETSHOP BOT - ЧАСТЬ 1: НАСТРОЙКИ И БАЗА
// ==========================================

const bSDK = new BastyonSdk();

// Главные константы
const ADMIN_BASTYON_ADDRESS = 'PDtbxHoMvkxT2QzogMN67LjGc1xpuEsrrZ'; 
const APP_STORAGE_KEY = 'pocket_shop_data_v2'; 

const REF_PERCENT_L1 = 0.10;  
const REF_PERCENT_L2 = 0.05;  
const REF_PERCENT_L3 = 0.025; 
const REFERRAL_DISCOUNT = 0.10; 

// Глобальное состояние
let appState = {
    catalog: [],      
    orders: [],       
    referrals: {}     
};

let currentUserAddress = '';

// Инициализация при загрузке страницы
window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    try {
        await bSDK.init();
        await bSDK.requestPermissions(['account', 'payment', 'messaging']);

        const userAccount = await bSDK.getAccount();
        currentUserAddress = userAccount.address;

        await loadAppState();
        await checkReferralLink();

        startBotInterface();
    } catch (error) {
        console.error("Ошибка старта:", error);
        showCriticalError();
    }
}

async function loadAppState() {
    try {
        const storedData = await bSDK.storage.get({ key: APP_STORAGE_KEY });
        if (storedData && storedData.value) {
            const parsed = JSON.parse(storedData.value);
            appState.catalog = parsed.catalog || [];
            appState.orders = parsed.orders || [];
            appState.referrals = parsed.referrals || {};
        }
    } catch (e) {
        console.warn("База данных пуста или создается впервые.");
    }
}

async function saveAppState() {
    try {
        await bSDK.storage.set({
            key: APP_STORAGE_KEY,
            value: JSON.stringify(appState)
        });
    } catch (error) {
        console.error("Ошибка сохранения данных:", error);
    }
}

async function registerReferral(insideUser, referer) {
    if (insideUser === referer) return;
    await loadAppState();

    if (!appState.referrals[insideUser]) {
        appState.referrals[insideUser] = referer;
        await saveAppState();
        
        try {
            await bSDK.sendMessage({
                to: referer,
                message: `🎉 По вашей ссылке зарегистрирован новый реферал!`
            });
        } catch (e) { console.log(e); }
    }
}

async function checkReferralLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const referer = urlParams.get('ref');
    if (referer && referer !== currentUserAddress) {
        await registerReferral(currentUserAddress, referer);
    }
}
// ==========================================
// POCKETSHOP BOT - ЧАСТЬ 2: БЛОКЧЕЙН И ЧАТ
// ==========================================

// Проверка транзакции через RPC-ноду
async function verifyBlockchainTransaction(txid, expectedAmount) {
    try {
        const txData = await bSDK.rpc('getrawtransaction', [txid, 1]);
        if (!txData || !txData.vout) return false;

        let totalSentToAdmin = 0;
        let isTargetFound = false;

        for (let output of txData.vout) {
            if (output.scriptPubKey && output.scriptPubKey.addresses) {
                if (output.scriptPubKey.addresses.includes(ADMIN_BASTYON_ADDRESS)) {
                    totalSentToAdmin += output.value;
                    isTargetFound = true;
                }
            }
        }

        if (isTargetFound && Math.abs(totalSentToAdmin - expectedAmount) < 0.0001) {
            return true; 
        }
        return false;
    } catch (error) {
        console.error("Ошибка RPC ноды:", error);
        return false;
    }
}

// Интерфейс чат-бота
function botSay(text) {
    const chatLog = document.getElementById('chat-log');
    if (!chatLog) return;
    const msg = document.createElement('div');
    msg.className = 'msg msg-bot';
    msg.innerHTML = `<div class="msg-bubble">${text}</div>`;
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function userSay(text) {
    const chatLog = document.getElementById('chat-log');
    if (!chatLog) return;
    const msg = document.createElement('div');
    msg.className = 'msg msg-user';
    msg.innerHTML = `<div class="msg-bubble">${text}</div>`;
    chatLog.appendChild(msg);
    chatLog.scrollTop = chatLog.scrollHeight;
}

function renderKeyboard(buttons) {
    const keyboardContainer = document.getElementById('keyboard-container');
    if (!keyboardContainer) return;
    keyboardContainer.innerHTML = '';
    buttons.forEach(btn => {
        const b = document.createElement('button');
        b.className = 'btn-keyboard';
        b.innerText = btn.text;
        b.onclick = () => {
            userSay(btn.text);
            btn.action();
        };
        keyboardContainer.appendChild(b);
    });
}

function startBotInterface() {
    botSay(`👋 Добро пожаловать в PocketShop Bot!<br>Я помогу вам совершить безопасную покупку товаров за PKOIN.`);
    showMainMenu();
}

function showMainMenu() {
    closeAdminUI();
    const menu = [
        { text: '🛒 Каталог товаров', action: showCatalog },
        { text: '🤝 Реф. программа', action: showReferralMenu },
        { text: '💰 Мой Баланс', action: showBalance },
        { text: '💬 Написать админу', action: openAdminChat }
    ];
    if (currentUserAddress === ADMIN_BASTYON_ADDRESS) {
        menu.push({ text: '⚙️ Админка', action: openAdminPanel });
    }
    renderKeyboard(menu);
}
// ==========================================
// POCKETSHOP BOT - ЧАСТЬ 3: ЛОГИКА МАГАЗИНА
// ==========================================

async function showCatalog() {
    await loadAppState();
    if (appState.catalog.length === 0) {
        botSay("📦 В данный момент каталог товаров пуст.");
        showMainMenu();
        return;
    }

    botSay("📋 Список доступных товаров:");
    const hasReferer = !!appState.referrals[currentUserAddress];

    appState.catalog.forEach((item, index) => {
        if (item.quantity <= 0) return;

        let priceText = `${item.price} PKOIN`;
        let finalPrice = item.price;

        if (hasReferer) {
            finalPrice = (item.price * (1 - REFERRAL_DISCOUNT)).toFixed(4);
            priceText = `<s>${item.price} PKOIN</s> <span class="discount-price">${finalPrice} PKOIN (-10% 🔥)</span>`;
        }

        botSay(`<b>${item.name}</b><br>Цена: ${priceText}<br>Остаток: ${item.quantity} шт.`);
        renderKeyboard([
            { text: `Купить: ${item.name}`, action: () => processPurchase(index, finalPrice) },
            { text: `⬅️ Назад в меню`, action: showMainMenu }
        ]);
    });
}

async function processPurchase(productIndex, finalPrice) {
    const item = appState.catalog[productIndex];
    botSay(`⏳ Инициирую оплату для "${item.name}"...`);

    try {
        const tx = await bSDK.payment({
            address: ADMIN_BASTYON_ADDRESS,
            amount: parseFloat(finalPrice),
            description: `Покупка: ${item.name}`
        });

        if (tx && tx.id) {
            botSay(`🔗 Проверяю платеж в блокчейне...`);
            const isLegit = await verifyBlockchainTransaction(tx.id, parseFloat(finalPrice));
            
            if (isLegit) {
                await loadAppState();
                appState.catalog[productIndex].quantity -= 1;
                
                const orderId = Math.floor(10000 + Math.random() * 90000);
                appState.orders.push({
                    id: orderId,
                    buyer: currentUserAddress,
                    productId: item.id,
                    productName: item.name,
                    txid: tx.id,
                    status: 'paid'
                });
                await saveAppState();

                botSay(`🎉 <b>Оплата успешно подтверждена!</b><br>🔑 Код заказа: <b>${orderId}</b><br>Передайте его админу.`);
                await sendReferralAlerts(currentUserAddress, item.price);
            } else {
                botSay(`❌ <b>Ошибка валидации!</b> Нода блокчейна не подтвердила получение платежа.`);
            }
        } else {
            botSay(`❌ Транзакция отменена.`);
        }
    } catch (error) {
        botSay(`❌ Ошибка платежа.`);
    }
    showMainMenu();
}

function findReferralChain(buyerAddress) {
    const l1 = appState.referrals[buyerAddress] || null;
    const l2 = l1 ? (appState.referrals[l1] || null) : null;
    const l3 = l2 ? (appState.referrals[l2] || null) : null;
    return { l1, l2, l3 };
}

async function sendReferralAlerts(buyerAddress, itemPrice) {
    const chain = findReferralChain(buyerAddress);
    const shortName = (addr) => `${addr.substr(0, 4)}...${addr.substr(-4)}`;
    const buyerName = shortName(buyerAddress);

    const sendAlert = async (to, percent, lvl) => {
        if (!to) return;
        const reward = (itemPrice * percent).toFixed(4);
        try {
            await bSDK.sendMessage({
                to: to,
                message: `💰 Ваш реферал ${lvl}-го уровня (${buyerName}) совершил покупку! Вам начислено бонусных: ${reward} PKOIN.`
            });
        } catch (e) {}
    };

    await sendAlert(chain.l1, REF_PERCENT_L1, 1);
    await sendAlert(chain.l2, REF_PERCENT_L2, 2);
    await sendAlert(chain.l3, REF_PERCENT_L3, 3);
}

function showReferralMenu() {
    const refLink = `https://bastyon.com{currentUserAddress}`;
    botSay(`🤝 <b>Партнерская программа (3 уровня)</b><br>Вы получаете: L1 - 10% | L2 - 5% | L3 - 2.5%<br>🔥 Друзья получают 10% скидку!<br>🔗 Ссылка:<br><code>${refLink}</code>`);
    showMainMenu();
}

async function showBalance() {
    try {
        const userAccount = await bSDK.getAccount();
        botSay(`👛 Кошелек: <code>${userAccount.address}</code><br>💰 Баланс: <b>${userAccount.balance} PKOIN</b>`);
    } catch (e) { botSay(`❌ Ошибка баланса.`); }
    showMainMenu();
}

function openAdminChat() {
    try {
        bSDK.openChat(ADMIN_BASTYON_ADDRESS);
        botSay("📱 Открываю личные сообщения с администратором...");
    } catch (e) {
        console.error("Не удалось открыть чат:", e);
        botSay(`❌ Не удалось открыть чат автоматически. Напишите админу вручную на адрес: <code>${ADMIN_BASTYON_ADDRESS}</code>`);
    }
    showMainMenu();
}

function showCriticalError() {
    botSay("❌ Критическая ошибка инициализации Bastyon SDK.");
}

// Логика Панели Администратора
function openAdminPanel() {
    if (currentUserAddress !== ADMIN_BASTYON_ADDRESS) return;
    document.getElementById('admin-screen').style.display = 'block';
    renderAdminData();
}

function closeAdminUI() {
    document.getElementById('admin-screen').style.display = 'none';
}

function renderAdminData() {
    const catalogList = document.getElementById('admin-catalog-list');
    catalogList.innerHTML = '';
    appState.catalog.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'admin-item';
        div.innerHTML = `<span>${item.name} (${item.price} PKOIN) - ${item.quantity}шт</span> 
                         <button onclick="deleteProduct(${index})" class="btn-delete">❌</button>`;
        catalogList.appendChild(div);
    });

    const ordersList = document.getElementById('admin-orders-list');
    ordersList.innerHTML = '';
    appState.orders.forEach(order => {
        const div = document.createElement('div');
        div.className = 'admin-item';
        div.innerHTML = `<b>Код: ${order.id}</b> | Покупатель: ${order.buyer.substr(0,6)}... | Товар: ${order.productName}`;
        ordersList.appendChild(div);
    });
}

async function addProduct() {
    const name = document.getElementById('p-name').value;
    const price = parseFloat(document.getElementById('p-price').value);
    const qty = parseInt(document.getElementById('p-qty').value);

    if (!name || isNaN(price) || isNaN(qty)) {
        alert("Заполните все поля корректно!");
        return;
    }

    await loadAppState();
    appState.catalog.push({ id: Date.now().toString(), name, price, quantity: qty });
    await saveAppState();
    
    renderAdminData();
    document.getElementById('p-name').value = '';
    document.getElementById('p-price').value = '';
    document.getElementById('p-qty').value = '';
}

async function deleteProduct(index) {
    if (confirm("Удалить этот товар?")) {
        await loadAppState();
        appState.catalog.splice(index, 1);
        await saveAppState();
        renderAdminData();
    }
}

