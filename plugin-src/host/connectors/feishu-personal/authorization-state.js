export function shouldSuppressAuthorizedReconcile({
    force,
    createNew,
    applicationId,
    applications,
    selectedApplication,
}) {
    if (force || createNew)
        return true;
    const requestedApplication = applicationId === undefined
        ? applications.length === 1 ? applications[0] : undefined
        : applications.find((application) => application.applicationId === applicationId);
    return Boolean(requestedApplication
        && selectedApplication?.applicationId !== requestedApplication.applicationId);
}

export function shouldReconcileAuthorizedFlow({
    userAuthorized,
    suppressAuthorizedReconcile,
    phase,
}) {
    return userAuthorized === true
        && suppressAuthorizedReconcile !== true
        && phase !== 'connected';
}

export function inferAuthorizedApplication({
    liveApplication,
    flowApplication,
    applications,
}) {
    return liveApplication
        ?? flowApplication
        ?? (applications.length === 1 ? applications[0] : null);
}
