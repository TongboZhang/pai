import inspect
import json
import os

from openpaisdk.storage import Storage
from openpaisdk.utils import get_response, Namespace
from openpaisdk.job import Job
from openpaisdk.io_utils import to_file
from openpaisdk import __jobs_cache__

def in_job_container(varname: str='PAI_CONTAINER_ID'):
    """in_job_container check whether it is inside a job container (by checking environmental variables)

    
    Keyword Arguments:
        varname {str} -- the variable to test (default: {'PAI_CONTAINER_ID'})
    
    Returns:
        [bool] -- return True is os.environ[varname] is set
    """
    if not os.environ.get(varname, ''):
        return False
    return True


class Client:

    def __init__(self, pai_uri: str, user: str=None, passwd: str=None, hdfs_web_uri: str=None, **kwargs):
        """Client create an openpai client from necessary information
        
        Arguments:
            pai_uri {str} -- format: http://x.x.x.x
        
        Keyword Arguments:
            user {str} -- user name (default: {None})
            passwd {str} -- password (default: {None})
            hdfs_web_uri {str} -- format http://x.x.x.x:yyyy (default: {None})
        """
        args, _, _, values = inspect.getargvalues(inspect.currentframe())
        self.config = {k: values[k] for k in args if k != 'self'}
        self.config.update(kwargs)
        self.storages = []
        self.add_storage(hdfs_web_uri=hdfs_web_uri)

    @staticmethod
    def from_json(pai_json: str, alias: str=None):
        """from_json create client from openpai json config file
        
        Arguments:
            pai_json {str} -- file path of json file
            alias {str} -- [description] (default: {None})
        
        Returns:
            Client -- 
                a specific Client (if alias is valid or only one cluster specified)
            str -- 
                cluster alias
        """
        with open(pai_json) as fn:
            cfgs = json.load(fn)
        clients = {key: Client(**args) for key, args in cfgs.items()}
        a = alias
        if not a and len(clients) == 1:
            a = list(clients.keys())[0]
        return clients[a], a

    def to_envs(self, exclude: list=['passwd'], prefix: str='PAI_SDK_CLIENT'):
        """to_envs to pass necessary information to job container via environmental variables
        
        Keyword Arguments:
            exclude {list} -- information will not be shared (default: {['passwd']})
            prefix {str} -- variable prefix (default: {'PAI_SDK_CLIENT'})
        
        Returns:
            [dict] -- environmental variables dictionary
        """

        return {'{}_{}'.format(prefix, k.upper()) : v for k, v in self.config.items() if k not in exclude}

    @staticmethod
    def from_envs(prefix: str='PAI_SDK_CLIENT', **kwargs):
        """from_envs create a client form environmental variables starting with prefix+'_'
        
        Keyword Arguments:
            prefix {str} -- [description] (default: {'PAI_SDK_CLIENT'})
        
        Returns:
            [Client] -- [description]
        """
        dic = {k[len(prefix)+1:].lower(): v for k,v in os.environ.items() if k.startswith(prefix+'_')}
        dic.update(kwargs)
        return Client(**dic)

    @property
    def user(self):
        return self.config['user']
    
    @property
    def pai_uri(self):
        return self.config['pai_uri']

    @property
    def storage(self):
        return self.storages[0] if len(self.storages) >0 else None
             
    def add_storage(self, hdfs_web_uri: str=None):
        "initialize the connection information"
        if hdfs_web_uri:
            self.storages.append(Storage(protocol='hdfs', url=hdfs_web_uri, user=self.user))
        return self
    
    def get_token(self, expiration=3600):
        """
        [summary]
            expiration (int, optional): Defaults to 3600. [description]
        
        Returns:
            OpenPAIClient: self
        """

        self.token = self.rest_api_token(expiration)
        return self

    def submit(self, job: Job, allow_job_in_job: bool=False, append_pai_info: bool=True):
        """
        [summary]
        
        Args:
            job (Job): job config
            allow_job_in_job (bool, optional): Defaults to False. [description]
        
        Returns:
            [str]: job name
        """

        if not allow_job_in_job:
            assert not in_job_container(), 'not allowed submiting jobs inside a job'
        job_config = job.to_job_config_v1()
        if append_pai_info:
            job_config.setdefault('jobEnvs', {}).update(self.to_envs())
        to_file(job_config, os.path.join(__jobs_cache__, job.spec.job_name, 'config.json'))            

        if job.spec.sources:
            code_dir = job.get_folder_path('code')
            for file in job.spec.sources:
                self.storage.upload(local_path=file, remote_path='{}/{}'.format(code_dir, file), overwrite=True)
        self.get_token().rest_api_submit(job_config)
        return job_config['jobName']

    def get_job_link(self, job_name: str):
        return '{}/job-detail.html?username={}&jobName={}'.format(self.pai_uri, self.user, job_name)

    def jobs(self, job_name: str=None, name_only: bool=False):
        """
        query the list of jobs
            jobName (str, optional): Defaults to None. [description]
            name_only (bool, optional): Defaults to False. [description]
        
        Returns:
            [type]: [description]
        """

        job_list = self.rest_api_jobs(job_name)
        return [j['name'] for j in job_list] if name_only else job_list

    def rest_api_jobs(self, job_name: str=None, info: str=None):
        pth = '{}/rest-server/api/v1/user/{}/jobs'.format(self.pai_uri, self.user)
        if job_name:
            pth = pth + '/' + job_name
            if info:
                assert info in ['config', 'ssh'], ('unsupported query information', info)
                pth = pth + '/' + info
        return get_response(pth, headers = {}, method='GET').json()

    def rest_api_token(self, expiration=3600):
        return get_response(
            '{}/rest-server/api/v1/token'.format(self.pai_uri), 
            body={
                'username': self.user, 'password': self.config['passwd'], 'expiration': expiration
            }
        ).json()['token']

    def rest_api_submit(self, job_config: dict):
        return get_response(
            '{}/rest-server/api/v1/user/{}/jobs'.format(self.pai_uri, self.user),
            headers = {
                'Authorization': 'Bearer {}'.format(self.token),
                'Content-Type': 'application/json'
            },
            body = job_config, 
            allowed_status=[202, 201]
        )
