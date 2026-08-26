export function selectPersonalApplication({
    applications,
    selectedApplication,
    applicationId,
    createNew = false,
}) {
    if (createNew)
        return undefined;
    if (applicationId !== undefined) {
        const selected = applications.find((application) => application.applicationId === applicationId);
        if (!selected)
            throw new Error('The selected Feishu application is unavailable.');
        return selected;
    }
    if (selectedApplication)
        return selectedApplication;
    if (applications.length === 1)
        return applications[0];
    if (applications.length > 1) {
        const error = new Error('Choose a Feishu application before starting personal authorization.');
        error.code = 'application_selection_required';
        throw error;
    }
    return undefined;
}
