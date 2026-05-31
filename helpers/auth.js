export const getUserRole = () => {

};

export const isAuthenticated = () => {

};

export const getUser = () => {

};

export const hasRole = (requiredRoles) => {
    const userRole = getUserRole();
    return userRole ? requiredRoles.includes(userRole) : false;
};

export const isAdmin = () => {
    return hasRole(['ADMIN']);
};

export const canAccessReports = () => {
    return hasRole(['ADMIN', 'INVENTORY_MANAGER', 'ACCOUNTS', 'SHOP_SUPERVISOR']);
};

export const canAccessRetailSales = () => {
    return hasRole(['ADMIN', 'CASHIER', 'SALES_EXECUTIVE', 'SHOP_SUPERVISOR', 'BILLING_OPERATOR']);
};

export const canAccessEventRegistration = () => {
    return hasRole(['ADMIN']);
};

export const canAccessUserManagement = () => {
    return hasRole(['ADMIN']);
};

export const canViewUserDetails = () => {
    return true;
};

export const canAccessInventoryManagement = () => {
    const userRole = getUserRole();
    const hasAccess = hasRole(['ADMIN', 'STORE_MANAGER', 'INVENTORY_MANAGER', 'SHOP_SUPERVISOR', 'INVENTORY_HELPER']);
    console.log('[AUTH] Checking inventory access - User role:', userRole, 'Has access:', hasAccess);
    return hasAccess;
};