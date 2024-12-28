const apiUrl = 'http://localhost:8081/api'; // Замените на ваш URL бэкенда
let currentDate;

const dateInput = document.getElementById('currentDate');

async function set_data_in_app() {
    const response_for_date = await fetch(`${apiUrl}/date`, {
        method: 'GET',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    currentDate = new Date(await response_for_date.text());
    //curdate = new Date(curdate.setDate(curdate.getDate() + 1));
    dateInput.value = currentDate.toISOString().split('T')[0];
}


dateInput.addEventListener('change', async () => {
    // Обновляем глобальную переменную выбранной даты
    currentDate = new Date(dateInput.value);
    loadOrders();
});

document.getElementById('addOrder').addEventListener('click', async () => {
    const customerName = document.getElementById('customerName').value;
    if (customerName) {
        const response_for_date = await fetch(`${apiUrl}/date`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        let curDate_bd = new Date(await response_for_date.text());
        let curDate_app = new Date(currentDate);
        if (curDate_bd > curDate_app) {
            showModal("Невозможно создать заказ, выбранная дата уже прошла");
            return;
        }

        const order = {
            customerName,
            orderDate: currentDate.toISOString().split('T')[0],
            positions: []
        };
        const response = await fetch(`${apiUrl}/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(order)
        });
        if (response.ok) {
            await loadOrders();
            document.getElementById('customerName').value = '';
        } else {
            showModal('Ошибка при добавлении заказа');
        }
    }
    else {
        showModal("Укажите заказчика");
    }
});

document.getElementById('nextDay').addEventListener('click', async () => {
    await processOrders();
});


document.getElementById('addPosition').addEventListener('click', async () => {
    const selectedProduct = document.getElementById('productSelect').value;
    const quantity = parseInt(document.getElementById('productQuantity').value);

    if (selectedOrderId && quantity > 0) {
        const response_for_date = await fetch(`${apiUrl}/date`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        let curDate_bd = new Date(await response_for_date.text());
        let curDate_app = new Date(currentDate);
        if (curDate_bd > curDate_app) {
            showModal("Невозможно добавить позицию в заказ, выбранная дата уже прошла");
            return;
        }
        const position = { productId: selectedProduct, quantity, selectedOrderId };
        const response = await fetch(`${apiUrl}/positions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(position)
        });

        if (response.ok) {
            await loadOrders();
            document.getElementById('productQuantity').value = '';
        } else {
            // Извлекаем сообщение об ошибке из ответа
            const errorData = await response.json();
            showModal(errorData.message || 'Произошла ошибка'); // Показываем сообщение об ошибке
            return;
        }
    } else {
        showModal('Пожалуйста, выберите заказ и укажите корректное количество.');
    }
});

document.getElementById('deletePosition').addEventListener('click', async () => {
    const selectedProduct = document.getElementById('productSelectForDelete').value;

    if (selectedOrderId > 0) {
        const response_for_date = await fetch(`${apiUrl}/date`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        let curDate_bd = new Date(await response_for_date.text());
        let curDate_app = new Date(currentDate);
        if (curDate_bd > curDate_app) {
            showModal("Невозможно удалить позицию из заказа, выбранная дата уже прошла");
            return;
        }
        await deletePosition(selectedOrderId, selectedProduct);
    } else {
        showModal('Пожалуйста, выберите заказ.');
    }
});

async function loadProducts() {
    try {
        const response = await fetch(`${apiUrl}/products`);
        const response2 = await fetch(`${apiUrl}/products`);

        if (!response.ok) {
            throw new Error(`Ошибка при загрузке продуктов: ${response.statusText}`);
        }
        const products = await response.json();
        const products2 = await response2.json();
        const productSelect = document.getElementById('productSelect');
        const productSelectFordelete = document.getElementById('productSelectForDelete');

        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = product.name;
            productSelect.appendChild(option);
        });

        products2.forEach(product => {
            const option = document.createElement('option');
            option.value = product.id;
            option.textContent = product.name;
            productSelectFordelete.appendChild(option);
        });
    } catch (error) {
        console.error(error);
        showModal('Не удалось загрузить номенклатуру товаров.');
    }
}


// Функция для удаления позиции
async function deletePosition(orderId, productId) {
    const response = await fetch(`${apiUrl}/positions/${orderId}/${productId}`, {
        method: 'DELETE'
    });

    if (response.status === 404) {
        const errorData = await response.json();
        showModal(errorData.message || 'Произошла ошибка при удалении позиции.');
        return;
    } else if (response.ok){
        await loadOrders();
        console.log(`Позиция с ID: ${productId} успешно удалена.`);
    } else {
        const errorData = await response.json();
        showModal(errorData.message || 'Произошла ошибка при удалении позиции.');
    }
}

document.getElementById('deleteOrder').addEventListener('click', async () => {
    console.log(selectedOrderId);
    if (selectedOrderId === null) {
        showModal('Не выбран заказ для удаления');
        return;
    } else {
        const response_for_date = await fetch(`${apiUrl}/date`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        let curDate_bd = new Date(await response_for_date.text());
        let curDate_app = new Date(currentDate);
        if (curDate_bd > curDate_app) {
            showModal("Невозможно удалить заказ, выбранная дата уже прошла");
            return;
        }
        const response = await fetch(`${apiUrl}/orders/${selectedOrderId}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({"deleted": selectedOrderId})
        });
        if (response.ok) {
            await loadOrders();
        } else {
            showModal('Ошибка при удалении заказа');
        }
    }
});

let selectedOrderId = null; // Глобальная переменная для хранения ID выбранного заказа

async function loadOrders() {
    await expire_orders();
    if (currentDate === undefined)
        await set_data_in_app();
    
    let formattedDate = currentDate.toISOString().split('T')[0]; // Форматируем дату в YYYY-MM-DD

    // Отправляем запрос с текущей датой
    const response = await fetch(`${apiUrl}/orders?date=${formattedDate}`);
    const orders = await response.json();
    
    const orderList = document.getElementById('orderList');
    orderList.innerHTML = ''; // Очищаем список заказов

    // Проверяем, есть ли заказы
    if (orders.length === 0) {
        const noOrdersMessage = document.createElement('li');
        noOrdersMessage.textContent = 'На эту дату нет заказов';
        orderList.appendChild(noOrdersMessage);
        return; // Завершаем выполнение функции, если заказов нет
    }

    // Отображаем заказы
    orders.forEach(order => {
        const li = document.createElement('li');
        
        // Форматируем дату без времени
        const orderDate = new Date(order.order_date).toLocaleDateString('ru-RU');

        // Создаем строку с информацией о заказе, включая статус
        li.textContent = `Заказ ID: ${order.id}, Заказчик: ${order.customer_name}, Дата: ${orderDate}, Статус: ${order.status}`;
        
        // Создаем элемент для списка товаров
        const itemsList = document.createElement('ul');
        order.items.forEach(item => {
            const itemLi = document.createElement('li');
            itemLi.textContent = `${item.product_name}: ${item.quantity}`;
            itemsList.appendChild(itemLi);
        });

        // Добавляем список товаров к элементу заказа
        li.appendChild(itemsList);

        // Добавляем обработчик события для выбора заказа
        li.onclick = () => {
            // Удаляем класс 'selected' у всех элементов
            const allItems = orderList.querySelectorAll('li');
            allItems.forEach(i => i.classList.remove('selected'));
            
            // Добавляем класс 'selected' к текущему элементу
            li.classList.add('selected');
            selectedOrderId = order.id; // Сохраняем ID выбранного заказа
            console.log(`Выбран заказ с ID: ${selectedOrderId}`); // Выводим ID в консоль
        };
        
        orderList.appendChild(li);
    });
}
loadOrders();


// Функция для подсветки выбранного заказа
function highlightSelectedOrder(selectedLi) {
    const orderList = document.getElementById('orderList');
    const items = orderList.getElementsByTagName('li');
    
    // Убираем подсветку у всех элементов
    for (let item of items) {
        item.style.backgroundColor = ''; // Сбрасываем цвет фона
    }
    
    // Подсвечиваем выбранный элемент
    selectedLi.style.backgroundColor = '#d3d3d3'; // Цвет подсветки
}

// Функция для удаления заказа
async function deleteOrder(orderId) {
    const response = await fetch(`${apiUrl}/orders/${orderId}`, {
        method: 'DELETE'
    });
    if (response.ok) {
        loadOrders(); // Обновляем список заказов
    } else {
        showModal('Ошибка при удалении заказа');
    }
}

async function get_delivery() {
    const response_for_delivery = await fetch(`${apiUrl}/get_delivery`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    if (response_for_delivery.ok) {
        return;
    } else {
        showModal('Ошибка при учтении новой поставки');
    }
}

async function change_order_status(order_status) {
    const response_for_status = await fetch(`${apiUrl}/orders`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({"status": order_status})
    });
    if (response_for_status.ok) {
        return;
    } else {
        showModal('Ошибка при изменении статуса');
    }
}

async function expire_orders() {
    const response_for_expire = await fetch(`${apiUrl}/orders`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json'
        }
    });
    if (response_for_expire.ok) {
        return;
    } else {
        showModal('Ошибка при отмене незафиксированных заказов');
    }
}

async function processOrders() {
    await change_order_status("зафиксирован");
    const response = await fetch(`${apiUrl}/date`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
    });
    if (response.ok) {
        let data = await response.json();
        currentDate = new Date(data["currentDate"]);
        dateInput.value = currentDate.toISOString().split("T")[0];
        await get_delivery();
        await loadOrders();
    } else {
        showModal('Ошибка при обработке заказов');
    }
}


loadProducts();

function showModal(message) {
    document.getElementById('modalMessage').textContent = message; // Устанавливаем текст сообщения
    document.getElementById('modal').style.display = 'flex'; // Показываем модальное окно
}

// Обработчик события для кнопки "OK"
document.getElementById('okButton').onclick = function() {
    document.getElementById('modal').style.display = 'none'; // Скрываем модальное окно
};

document.getElementById('modalMessage').textContent = "";
document.getElementById('modal').style.display = 'none';
