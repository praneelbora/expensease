const BASE_URL = import.meta.env.VITE_BACKEND_URL;

export const createExpense = async (expenseData, userToken) => {
   const response = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': userToken
                },
                body: JSON.stringify(expenseData)
            });
    if (!response.ok) throw new Error(data.message || "Failed to create new Expense");
    const data = await response.json();
    return data;
};

export const deleteExpense = async (expenseId, userToken) => {
    try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses/${expenseId}`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": userToken, // include token if your backend requires auth
            },
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Failed to delete expense");
        }

        return data;
    } catch (err) {
        console.error("Error in deleteExpense:", err);
        throw err;
    }
};

export const getAllExpenses = async (userToken) => {
    try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses`, {
            method: "GET",
            headers: {
                "Content-Type": "application/json",
                "x-auth-token": userToken, // include token if your backend requires auth
            },
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Failed to fetch expenses");
        }
        console.log(data);
        
        return data;
    } catch (err) {
        console.error("Error in deleteExpense:", err);
        throw err;
    }
};

export const settleExpense = async ({ payerId, receiverId, amount, description, groupId }, userToken) => {
    if (!payerId || !receiverId || !amount) {
        throw new Error("Please fill all required fields.");
    }

    try {
        const res = await fetch(`${import.meta.env.VITE_BACKEND_URL}/v1/expenses/settle`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-auth-token': userToken
            },
            body: JSON.stringify({
                fromUserId: payerId,
                toUserId: receiverId,
                amount: parseFloat(amount),
                description,
                groupId
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Failed to settle");
        }

        return data;
    } catch (err) {
        console.error("Error in settleExpense:", err);
        throw err;
    }
};
