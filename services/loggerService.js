module.exports = {
    printRequestError : function(fileName, routeName, requestUser, requestBody, err){
        const timestamp = new Date().toISOString();
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        const errorStack = err?.stack || '';
        console.error(`|ERROR|${timestamp}|${fileName}|${routeName}|user:${JSON.stringify(requestUser)}|body:${JSON.stringify(requestBody)}|message:${errorMessage}|stack:${errorStack}`);
    },
    printError : function(fileName, functionName, functionParams, err){
        const timestamp = new Date().toISOString();
        const errorMessage = err?.message || err?.toString() || 'Unknown error';
        const errorStack = err?.stack || '';
        console.error(`|ERROR|${timestamp}|${fileName}|${functionName}|params:${JSON.stringify(functionParams)}|message:${errorMessage}|stack:${errorStack}`);
    },
    printDebug : function(fileName, functionName, functionParams){
        const timestamp = new Date().toISOString();
        console.debug(`|DEBUG|${timestamp}|${fileName}|${functionName}|params:${JSON.stringify(functionParams)}`);
    },
    printInfo : function(fileName, message){
        const timestamp = new Date().toISOString();
        console.info(`|INFO|${timestamp}|${fileName}|message:${message}`);
    }
}