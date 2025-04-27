from flask import request, jsonify
import ErrorMessage
import logging
import json
import datetime
import GlobalLogging
from pydantic.main import BaseModel as PydanticBaseModel  # Import the base class


class FlaskRequestHandler():
    def getRequestParams(self, param_name):
        return request.args.get(param_name)
    def getPostRequestParams(self, param_name):
        return request.form.get(param_name)
    def getPostJsonParams(self):
        return request.get_json() 

class InstachainRequestHandler(FlaskRequestHandler):
    def __init__(self):
        self.result = ErrorMessage.build_error_message(ErrorMessage.ERROR_SUCCESS)
        self.parameters = []

    def getParameters(self):
        pass
    def processRequest(self):
        pass
    def handleRequest(self):
        self.preProcessRequest() #to do anything before processing the request, such as logging time
        GlobalLogging.log_text(request.get_data().decode('UTF-8'))
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
        handler.handleRequest()
        # Check if handler.result is an instance of PydanticBaseModel
        # If it is, dump it to a dictionary, otherwise return it as is
        if (isinstance(handler.result, PydanticBaseModel)):
            return jsonify(handler.result.model_dump())
        else:
            return jsonify(handler.result)