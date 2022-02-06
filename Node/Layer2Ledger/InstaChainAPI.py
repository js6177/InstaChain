from google.cloud import ndb
from flask import request
import ErrorMessage
import logging
import json
import datetime
from google.cloud import logging
import GlobalLogging

class FlaskRequestHandler():
    def getRequestParams(self, param_name):
        return request.args.get(param_name)
    def getPostRequestParams(self, param_name):
        return request.form.get(param_name)
    def getPostJsonParams(self):
        return request.get_json() 

class InstachainRequestHandler(FlaskRequestHandler):
    parameters = []

    result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)

    def getParameters(self):
        pass
    def processRequest(self):
        pass
    def handleRequest(self):
        self.preProcessRequest() #to do anything before processing the request, such as logging time
        GlobalLogging.logger.log_text(request.get_data().decode('UTF-8'))
        self.getParameters()

        self.processRequest()
        self.postProcessRequest() #to do anything after processing the request, such as logging error codes
    def post(self):
        self.handleRequest()
        logging.info("InstachainRequestHandler POST called")
    def get(self):
        logging.info("InstachainRequestHandler GET called")
        self.handleRequest()
    def preProcessRequest(self):
        pass
    def postProcessRequest(self):
        pass

    @classmethod
    def initializeRequest(cls):
        handler = cls()
        client = ndb.Client()
        with client.context():
            handler.handleRequest()
        return handler.result