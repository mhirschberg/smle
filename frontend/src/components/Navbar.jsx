import React, { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { configApi } from '../services/api';

const Navbar = () => {
  const [dbName, setDbName] = useState('...');

  useEffect(() => {
    configApi.getConfig()
      .then(response => {
        const { db_type, db_name } = response.data;
        if (db_name) {
          setDbName(db_name);
        } else {
          // Fallback legacy mapping
          if (db_type === 'cratedb') setDbName('CrateDB Cloud');
          else if (db_type === 'couchbase') setDbName('Couchbase Capella');
          else if (db_type === 'postgres') setDbName('PostgreSQL');
          else if (db_type) setDbName(db_type.charAt(0).toUpperCase() + db_type.slice(1));
        }
      })
      .catch(err => {
        console.error('Failed to load config', err);
        setDbName('Cloud');
      });
  }, []);

  return (
    <nav className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img src="/smle-logo.png" alt="SMLE" className="h-10" />
            <Search className="w-8 h-8" />
            <h1 className="text-2xl font-bold">Social Media Listening Engine</h1>
          </div>
          <div className="text-sm">
            Powered by Bright Data & {dbName}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;

