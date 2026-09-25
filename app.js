const bSDK = new BastyonSdk();
let userAddress = null;
let userName = "Аноним"; 

const ADMIN_BASTYON_ADDRESS = 'PDtbxHoMvkxT2QzogMN67LjGc1xpuEsrrZ'; 

let catalog = [];
let orders = [];
let userTree = {}; 
let baseRefPercent = 0.10; // 10% по умолчанию

const chatContainer = document.getElementById('chatContainer');
const keyboardContainer = document.getElementById('keyboardContainer');
const adminPanelBtn = document.getElementById('adminPanelBtn');
const adminPanel = document.getElementById('adminPanel');
const adminProductsList = document.getElementById('adminProductsList');
const adminOrdersList = document.getElementById('adminOrdersList');
const adminAnalytics = document.getElementById('adminAnalytics');

function botSay(text) {
    const msg = document.createElement('div');
    msg.className = 'msg bot';
    msg.innerHTML = text;
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

function userSay(text) {
    const msg = document.createElement('div');
    msg.className = 'msg user';
    msg.innerText = text;
    chatContainer.appendChild(msg);
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function initApp() {
    try {
        await bSDK.init();
        botSay("👋 Добро пожаловать в децентрализованный **PocketShop**!");
        botSay("⏳ Синхронизация данных блокчейна...");

        if (!(await requestRequiredPermissions())) return;

        const account = await bSDK.get.account();
        userAddress = account.address;
        userName = account.name || account.address.substring(0, 8) + "...";

        // Проверка прав администратора
        if (userAddress.toLowerCase() === ADMIN_BASTYON_ADDRESS.toLowerCase()) {
            adminPanelBtn.style.display = 'block';
            document.getElementById('botStatus').innerText = 'Режим: Administrator 👑';
        }

        await loadDataFromStorage();
        await processReferralSignup();

        showMainMenu();
    } catch (e) { botSay("❌ Ошибка запуска."); }
}

async function requestRequiredPermissions() {
    const permissions = ['account', 'payment', 'chat', 'messaging'];
    try {
        const check = await bSDK.permissions.check({ permissions });
        if (!check.account || !check.payment || !check.chat || !check.messaging) {
            const req = await bSDK.permissions.request({ permissions });
            return req.account && req.payment && req.chat && req.messaging;
        }
        return true;
    } catch (e) { return false; }
}

async function loadDataFromStorage() {
    try {
        const catData = await bSDK.storage.get({ key: 'shop_catalog' });
        catalog = catData && catData.value ? JSON.parse(catData.value) : [];

        const ordData = await bSDK.storage.get({ key: 'shop_orders' });
        orders = ordData && ordData.value ? JSON.parse(ordData.value) : [];

        const treeData = await bSDK.storage.get({ key: 'shop_users_tree' });
        userTree = treeData && treeData.value ? JSON.parse(treeData.value) : {};

        const settingsData = await bSDK.storage.get({ key: 'shop_settings' });
        if (settingsData && settingsData.value) {
            const settings = JSON.parse(settingsData.value);
            baseRefPercent = settings.baseRefPercent || 0.10;
        }
        document.getElementById('refPercentInput').value = (baseRefPercent * 100).toFixed(0);
    } catch (e) { console.error("Ошибка загрузки хранилища", e); }
}

async function processReferralSignup() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    
    if (ref && ref.toLowerCase() !== userAddress.toLowerCase()) {
        if (!userTree[userAddress]) {
            userTree[userAddress] = ref;
            try {
                await bSDK.storage.set({ key: 'shop_users_tree', value: JSON.stringify(userTree) });
                await bSDK.chat.send({
                    address: ref,
                    message: `👋 Привет! Пользователь ${userName} (${userAddress}) только что успешно зарегистрировался по вашей реферальной ссылке в PocketShop!`
                });
                botSay(`🎉 Вы зашли по реферальной ссылке! Вам активирована **скидка 10%** на все покупки!`);
            } catch (e) { console.error("Ошибка уведомления реферала", e); }
        }
    }
}

async function saveRefPercentFromAdmin() {
    const pctInput = document.getElementById('refPercentInput').value;
    if (!pctInput || pctInput < 0 || pctInput > 50) return alert("Введите корректный процент от 0 до 50");
    baseRefPercent = parseFloat(pctInput) / 100;
    try {
        await bSDK.storage.set({ key: 'shop_settings', value: JSON.stringify({ baseRefPercent: baseRefPercent }) });
        botSay(`⚙️ Администратор изменил базовый реф. процент на **${pctInput}%**.`);
        toggleAdminPanel();
    } catch (e) { alert("Ошибка настроек."); }
}

function calculateAnalytics() {
    let totalRevenue = 0; let totalOrders = orders.length; let uniqueBuyers = new Set(); let productStats = {};
    catalog.forEach(item => { productStats[item.name] = { count: 0, revenue: 0 }; });
    orders.forEach(order => {
        totalRevenue += order.price; uniqueBuyers.add(order.buyer);
        if (!productStats[order.productName]) { productStats[order.productName] = { count: 0, revenue: 0 }; }
        productStats[order.productName].count += 1; productStats[order.productName].revenue += order.price;
    });
    let html = `
        <div class="metrics-row">
            <div class="metric-card"><span>Общая выручка</span><b>${totalRevenue.toFixed(2)} PKOIN</b></div>
            <div class="metric-card"><span>Всего продаж</span><b>${totalOrders} шт.</b></div>
        </div>
        <div class="metrics-row">
            <div class="metric-card"><span>Уникальных клиентов</span><b>${uniqueBuyers.size}</b></div>
            <div class="metric-card"><span>Реф. % (L1/L2/L3)</span><b> ${(baseRefPercent*100).toFixed(0)}% / ${(baseRefPercent*50).toFixed(1)}% / ${(baseRefPercent*25).toFixed(1)}%</b></div>
        </div>
        <div style="margin-top: 5px; font-weight: bold; color: #7f91a4; font-size:12px;">📊 Продажи по товарам:</div>
        <div class="product-sales-list">
    `;
    for (const [prodName, stat] of Object.entries(productStats)) {
        html += `<div class="product-sales-item"><span>${prodName}</span><span><b>${stat.count} шт.</b> (${stat.revenue.toFixed(1)} PKOIN)</span></div>`;
    }
    html += `</div>`; adminAnalytics.innerHTML = html;
}

function renderAdminData() {
    calculateAnalytics();
    adminProductsList.innerHTML = '';
    catalog.forEach((item, index) => {
        const row = document.createElement('div'); row.className = 'admin-item-row';
        row.innerHTML = `<span>${item.name} — <b>${item.price} PKOIN</b> (${item.quantity} шт)</span><button class="btn-delete" onclick="deleteProduct(${index})">❌ Удалить</button>`;
        adminProductsList.appendChild(row);
    });
    adminOrdersList.innerHTML = '';
    if (orders.length === 0) { adminOrdersList.innerHTML = '<div style="text-align:center; font-size:12px;">Нет заказов</div>'; } 
    else {
        [...orders].reverse().forEach(ord => {
            const row = document.createElement('div'); row.className = 'admin-order-row';
            row.innerHTML = `📌 Код: <b>${ord.id}</b> | Статус: <span style="color:#31b54a;">● ОПЛАЧЕН</span><br>🛒 ${ord.productName} (${ord.price} PKOIN)<br>👤 Покупатель: ${ord.buyerName || 'Аноним'} (<small>${ord.buyer}</small>)${ord.levelsPaid ? `<br>👥 Выплаты рефералам: ${ord.levelsPaid}` : ''}`;
            adminOrdersList.appendChild(row);
        });
    }
}

function toggleAdminPanel() {
    if (adminPanel.style.display === 'none') { renderAdminData(); adminPanel.style.display = 'flex'; } 
    else { adminPanel.style.display = 'none'; }
}

async function addNewProductFromAdmin() {
    const name = document.getElementById('prodName').value; const price = document.getElementById('prodPrice').value; const qty = document.getElementById('prodQty').value;
    if (!name || !price || !qty) return alert("Заполните поля!");
    catalog.push({ name, price: parseFloat(price), quantity: parseInt(qty) });
    await saveData('shop_catalog', catalog, `✨ Добавлен товар: **${name}**.`);
    document.getElementById('prodName').value = '';
    document.getElementById('prodPrice').value = '';
    document.getElementById('prodQty').value = '';
}
async function deleteProduct(index) {
    const name = catalog[index].name;
    if (confirm(`Удалить "${name}"?`)) { catalog.splice(index, 1); await saveData('shop_catalog', catalog, `🗑️ Удален: **${name}**`); }
}
async function clearAllCatalog() {
    if (confirm("Очистить каталог?")) { catalog = []; await saveData('shop_catalog', catalog, `🧹 Очищено.`); }
}
async function saveData(key, dataArray, botMsg) {
    try { await bSDK.storage.set({ key: key, value: JSON.stringify(dataArray) }); if (botMsg) botSay(botMsg); renderAdminData(); showMainMenu(); } catch (e) { alert("Ошибка блокчейна."); }
}

function showMainMenu() {
    keyboardContainer.innerHTML = `
        <button class="tg-btn" onclick="checkBalance()">💰 Мой Баланс</button>
        <button class="tg-btn" onclick="showCatalog()">🛒 Каталог товаров</button>
        <button class="tg-btn" onclick="showReferralMenu()">👥 Реф. программа</button>
        <button class="tg-btn" onclick="openAdminChat()">✍️ Обратная связь</button>
        <button class="tg-btn" style="grid-column: span 2;" onclick="sendDonate()">❤️ Донат автору</button>
    `;
}

function showReferralMenu() {
    /* ========================================================
   ФРОНТЕНД ПОЛЬЗОВАТЕЛЯ И КАСКАДНЫЙ Web3 СПЛИТ-ПЛАТЕЖ
   ======================================================== */

function showMainMenu() {
    keyboardContainer.innerHTML = 
        '<button class="tg-btn" onclick="checkBalance()">💰 Мой Баланс</button>' +
        '<button class="tg-btn" onclick="showCatalog()">🛒 Каталог товаров</button>' +
        '<button class="tg-btn" onclick="showReferralMenu()">👥 Реф. программа</button>' +
        '<button class="tg-btn" onclick="openAdminChat()">✍️ Обратная связь</button>' +
        '<button class="tg-btn" style="grid-column: span 2;" onclick="sendDonate()">❤️ Донат автору</button>';
}

function showReferralMenu() {
    userSay("👥 Открыть реферальную программу");
    var baseAppUrl = window.location.href.split('?')[0];
    var personalRefUrl = baseAppUrl + "?ref=" + userAddress;
    
    botSay("🤝 **3-Уровневая Реферальная программа**<br><br>" +
           "Приглашайте друзей по своей ссылке и получайте автоматический доход в PKOIN на 3 поколения в глубину:<br>" +
           "• **1 уровень (прямой друг):** " + (baseRefPercent * 100).toFixed(0) + "% от его покупок<br>" +
           "• **2 уровень (друг друга):** " + (baseRefPercent * 50).toFixed(1) + "% от его покупок<br>" +
           "• **3 уровень (следующий круг):** " + (baseRefPercent * 25).toFixed(1) + "% от его покупок<br><br>" +
           "🎁 *Каждый, кто перейдет по вашей ссылке, мгновенно получит **скидку 10%** на все товары магазина!*<br><br>" +
           "🔗 **Ваша реф-ссылка для копирования:**<br>" +
           "<code style='background:#101921; padding:4px; display:block; word-break:break-all; border-radius:4px; margin-top:5px; color:#4ba3e3;'>" + personalRefUrl + "</code>");
    showMainMenu();
}

function showCatalog() {
    userSay("🛒 Открыть каталог");
    if (catalog.length === 0) { 
        botSay("В магазине нет товаров."); 
        showMainMenu(); 
        return; 
    }
    
    var hasReferrer = userTree[userAddress] ? true : false;
    botSay(hasReferrer ? "🔥 Для вас действуют **цены со скидкой 10%** по реферальной программе:" : "Выберите товар из каталога:");
    
    var html = '';
    catalog.forEach(function(item, index) {
        var finalPrice = hasReferrer ? item.price * 0.9 : item.price;
        if (item.quantity > 0) { 
            var discountLabel = hasReferrer ? " <span style='text-decoration:line-through; font-size:11px; color:#e53935;'>" + item.price + "</span>" : "";
            html += '<button class="tg-btn" onclick="buyItem(' + index + ')">' + item.name + '<br>💰 ' + finalPrice.toFixed(2) + ' PKOIN' + discountLabel + ' (Осталось: ' + item.quantity + ' шт)</button>'; 
        } else { 
            html += '<button class="tg-btn" style="opacity:0.5; color:#7f91a4;" disabled>' + item.name + '<br>❌ Нет в наличии</button>'; 
        }
    });
    html += '<button class="tg-btn" onclick="showMainMenu()">⬅️ Назад в меню</button>';
    keyboardContainer.innerHTML = html;
}

async function buyItem(index) {
    const item = catalog[index];
    if (item.quantity <= 0) return botSay("😔 Товар закончился.");
    userSay("Купить " + item.name);

    let u1 = userTree[userAddress] || null;
    let u2 = u1 ? (userTree[u1] || null) : null;
    let u3 = u2 ? (userTree[u2] || null) : null;

    let actualPrice = u1 ? item.price * 0.9 : item.price;

    let p1 = u1 ? actualPrice * baseRefPercent : 0;
    let p2 = u2 ? actualPrice * (baseRefPercent / 2) : 0;
    let p3 = u3 ? actualPrice * (baseRefPercent / 4) : 0;
    let adminShare = actualPrice - (p1 + p2 + p3);

    botSay("Ожидаю оплату **" + actualPrice.toFixed(2) + " PKOIN** за товар **" + item.name + "**...");

    try {
        let tx = await bSDK.payment({
            address: ADMIN_BASTYON_ADDRESS,
            amount: adminShare,
            description: "Покупка: " + item.name + " (Основная доля)"
        });

        let levelsPaid = [];

        if (tx && tx.valid) {
            if (u1 && p1 > 0) {
                try { 
                    await bSDK.payment({ address: u1, amount: p1, description: "Реф-бонус L1: " + item.name }); 
                    levelsPaid.push("L1");
                    await bSDK.chat.send({ address: u1, message: "💰 **Новая продажа!** Ваш реферал 1-го уровня **" + userName + "** купил \"" + item.name + "\". Вам начислен бонус: **" + p1.toFixed(2) + " PKOIN**!" });
                } catch(e){}
            }
            if (u2 && p2 > 0) {
                try { 
                    await bSDK.payment({ address: u2, amount: p2, description: "Реф-бонус L2: " + item.name }); 
                    levelsPaid.push("L2");
                    await bSDK.chat.send({ address: u2, message: "💰 **Новая продажа!** Реферал 2-го уровня **" + userName + "** совершил покупку \"" + item.name + "\". Вам начислен бонус: **" + p2.toFixed(2) + " PKOIN**!" });
                } catch(e){}
            }
            if (u3 && p3 > 0) {
                try { 
                    await bSDK.payment({ address: u3, amount: p3, description: "Реф-бонус L3: " + item.name }); 
                    levelsPaid.push("L3");
                    await bSDK.chat.send({ address: u3, message: "💰 **Новая продажа!** Реферал 3-го уровня **" + userName + "** совершил покупку \"" + item.name + "\". Вам начислен бонус: **" + p3.toFixed(2) + " PKOIN**!" });
                } catch(e){}
            }

            catalog[index].quantity -= 1;
            await bSDK.storage.set({ key: 'shop_catalog', value: JSON.stringify(catalog) });

            const orderId = Math.floor(10000 + Math.random() * 90000).toString();

            orders.push({
                id: orderId, productName: item.name, price: actualPrice, buyer: userAddress, buyerName: userName, txid: tx.txid, status: "Оплачен",
                levelsPaid: levelsPaid.length > 0 ? levelsPaid.join(", ") : "нет (соло)"
            });
            await bSDK.storage.set({ key: 'shop_orders', value: JSON.stringify(orders) });

            botSay("🎉 **ОПЛАТА УСПЕШНО ПРОШЛА!**<br><br>" +
                   "📦 Номер вашего заказа: <b style='color:#31b54a; font-size:18px;'>" + orderId + "</b><br><br>" +
                   "👉 Откройте чат с админом по кнопке **«✍️ Обратная связь»**, напишите ему код заказа и получите ваш товар!");
        }
    } catch (err) { botSay("❌ Оплата отменена."); }
    showMainMenu();
}

async function checkBalance() {
    userSay("💰 Проверить баланс");
    try {
        const account = await bSDK.get.account(); 
        const balanceInfo = await bSDK.get.balance();
        botSay("👤 **Кошелек:** <br>" + account.address + "<br><br>💵 **Баланс:** " + balanceInfo.balance + " PKOIN");
    } catch (e) { botSay("❌ Ошибка."); } 
    showMainMenu();
}

async function openAdminChat() {
    userSay("✍️ Обратная связь"); 
    botSay("⏳ Открываю чат...");
    try { await bSDK.chat.openOrCreateRoom({ address: ADMIN_BASTYON_ADDRESS }); } catch (e) { botSay("❌ Ошибка."); } 
    showMainMenu();
}

async function sendDonate() {
    userSay("❤️ Донат");
    try { await bSDK.payment({ address: ADMIN_BASTYON_ADDRESS, amount: 0.5, description: "Донат" }); botSay("😇 Спасибо!"); } catch(e) { botSay("❌ Отменено."); } 
    showMainMenu();
}

initApp();


