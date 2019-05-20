// Copyright (c) Microsoft Corporation
// All rights reserved.
//
// MIT License
//
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
// documentation files (the "Software"), to deal in the Software without restriction, including without limitation
// the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and
// to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
// BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
// NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import React, {useState, useEffect, useMemo, useRef} from 'react';

import {Fabric, Stack, initializeIcons, getTheme} from 'office-ui-fabric-react';
import {debounce} from 'lodash';

import {MaskSpinnerLoading} from '../../../components/loading';
import {initTheme} from '../../../components/theme';
import MessageBox from '../components/MessageBox';

import t from '../../../components/tachyons.scss';

import Context from './Context';
import TopBar from './TopBar';
import Table from './Table';
import Ordering from './Ordering';
import Filter from './Filter';
import Pagination from './Pagination';
import Paginator from './Paginator';
import UserEditor from './UserEditor';
import BatchPasswordEditor from './BatchPasswordEditor';
import BatchVirtualClustersEditor from './BatchVirtualClustersEditor';
import {getAllUsersRequest, getAllVcsRequest, removeUserRequest} from '../conn';

initTheme();
initializeIcons();

export default function UserView() {
  const [loading, setLoading] = useState({'show': false, 'text': ''});
  const showLoading = (text) => {
    setLoading({'show': true, 'text': text});
  };
  const hideLoading = () => {
    setLoading({'show': false});
  };

  const [messageBox, setMessageBox] = useState({text: '', confirm: false, resolve: null});
  const showMessageBox = (value) => {
    return new Promise((resolve, _reject) => {
      setMessageBox({text: String(value), resolve});
    });
  };
  const showMessageBoxWithConfirm = (value) => {
    return new Promise((resolve, _reject) => {
      setMessageBox({text: String(value), resolve, confirm: true});
    });
  };
  const hideMessageBox = (value) => {
    const resolve = messageBox.resolve;
    setMessageBox({text: ''});
    if (resolve) {
      resolve(value);
    }
  };

  const [allUsers, setAllUsers] = useState([]);
  const refreshAllUsers = () => {
    setAllUsers([]);
    getAllUsersRequest().then((data) => {
      setAllUsers(data);
    }).catch((err) => {
      showMessageBox(err).then(() => {
        window.location.href = '/';
      });
    });
  };
  useEffect(refreshAllUsers, []);

  const [allVCs, setAllVCs] = useState([]);
  const refreshAllVCs = () => {
    getAllVcsRequest().then((data) => {
      setAllVCs(Object.keys(data).sort());
    });
  };
  useEffect(refreshAllVCs, []);

  const initialFilter = useMemo(() => {
    const filter = new Filter();
    filter.load();
    return filter;
  });
  const [filter, setFilter] = useState(initialFilter);
  useEffect(() => filter.save(), [filter]);

  const [filteredUsers, setFilteredUsers] = useState(null);
  const {current: applyFilter} = useRef(debounce((allUsers, /** @type {Filter} */filter) => {
    setFilteredUsers(filter.apply(allUsers || []));
  }, 200));
  useEffect(() => {
    applyFilter(allUsers, filter);
  }, [applyFilter, allUsers, filter]);

  const [pagination, setPagination] = useState(new Pagination());
  useEffect(() => {
    setPagination(new Pagination(pagination.itemsPerPage, 0));
  }, [filteredUsers]);

  const [selectedUsers, setSelectedUsers] = useState([]);
  const [allSelected, setAllSelected] = useState(false);
  const getSelectedUsers = () => {
    if (allSelected) {
      return pagination.apply(ordering.apply(filteredUsers || []));
    } else {
      return selectedUsers;
    }
  };

  const [ordering, setOrdering] = useState(new Ordering());

  const importCSV = () => {
    window.location.href = '/batch-register.html';
  };

  const removeUsers = () => {
    const selected = getSelectedUsers();
    showMessageBoxWithConfirm(`Are you sure to remove ${selected.length == 1 ? 'the user' : 'these users'}?`)
      .then((confirmed) => {
        if (confirmed) {
          showLoading('Processing...');
          Promise.all(selected.map((user) => removeUserRequest(user.username).catch((err) => err)))
            .then((results) => {
              hideLoading();
              const errors = results.filter((result) => result instanceof Error);
              let message = `Remove ${selected.length == 1 ? 'user' : 'users'} `;
              if (errors.length == 0) {
                message += 'successfully.';
              } else {
                message += `with ${errors.length} failed.`;
                errors.forEach((error) => {
                  message += `\n${String(error)}`;
                });
              }
              setTimeout(() => {
                showMessageBox(message).then(() => {
                  refreshAllUsers();
                });
              }, 100);
            });
        }
      });
  };

  const [userEditor, setUserEditor] = useState({isOpen: false, isCreate: true, user: {}});
  const addUser = () => {
    setUserEditor({isOpen: true, isCreate: true, user: {}});
  };
  const editUser = (user) => {
    setUserEditor({isOpen: true, isCreate: false, user});
  };
  const hideAddOrEditUser = () => {
    setUserEditor({isOpen: false, isCreate: true, user: {}});
  };

  const [batchPasswordEditor, setBatchPasswordEditor] = useState({isOpen: false});
  const showBatchPasswordEditor = () => {
    setBatchPasswordEditor({isOpen: true});
  };
  const hideBatchPasswordEditor = () => {
    setBatchPasswordEditor({isOpen: false});
  };

  const [batchVirtualClustersEditor, setBatchVirtualClustersEditor] = useState({isOpen: false, user: {}});
  const showBatchVirtualClustersEditor = () => {
    setBatchVirtualClustersEditor({isOpen: true});
  };
  const hideBatchVirtualClustersEditor = () => {
    setBatchVirtualClustersEditor({isOpen: false});
  };

  const context = {
    allUsers,
    refreshAllUsers,
    allVCs,
    filteredUsers,
    ordering,
    setOrdering,
    filter,
    setFilter,
    pagination,
    setPagination,
    setSelectedUsers,
    getSelectedUsers,
    setAllSelected,
    addUser,
    importCSV,
    removeUsers,
    editUser,
    showBatchPasswordEditor,
    showBatchVirtualClustersEditor,
    showMessageBox,
  };

  const {spacing} = getTheme();

  return (
    <Context.Provider value={context}>
      <Fabric className={t.h100}>
        <Stack verticalFill styles={{root: [t.relative, {padding: `0 ${spacing.l1} ${spacing.l1}`}]}}>
          <Stack.Item>
            <TopBar />
          </Stack.Item>
          <Stack.Item grow styles={{root: [t.overflowAuto, t.bgWhite, {paddingTop: spacing.m}]}}>
            <Table />
          </Stack.Item>
          <Stack.Item>
            <Paginator />
          </Stack.Item>
        </Stack>
      </Fabric>
      {userEditor.isOpen && <UserEditor
        isOpen={userEditor.isOpen}
        isCreate={userEditor.isCreate}
        user={userEditor.user}
        hide={hideAddOrEditUser}
      />
      }
      {batchPasswordEditor.isOpen && <BatchPasswordEditor
        isOpen={batchPasswordEditor.isOpen}
        hide={hideBatchPasswordEditor}
      />
      }
      {batchVirtualClustersEditor.isOpen && <BatchVirtualClustersEditor
        isOpen={batchVirtualClustersEditor.isOpen}
        hide={hideBatchVirtualClustersEditor}
      />
      }
      {loading.show && <MaskSpinnerLoading label={loading.text} />}
      {messageBox.text && <MessageBox text={messageBox.text} onDismiss={hideMessageBox} confirm={messageBox.confirm} />}
    </Context.Provider>
  );
}
